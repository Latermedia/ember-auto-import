"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeConfig = void 0;
const path_1 = require("path");
const lodash_1 = require("lodash");
const fs_1 = require("fs");
const handlebars_1 = require("handlebars");
const js_string_escape_1 = __importDefault(require("js-string-escape"));
const broccoli_plugin_1 = __importDefault(require("broccoli-plugin"));
const shared_internals_1 = require("@embroider/shared-internals");
const shared_internals_2 = require("@embroider/shared-internals");
const typescript_memoize_1 = require("typescript-memoize");
const debug_1 = __importDefault(require("debug"));
const fs_extra_1 = require("fs-extra");
const mini_css_extract_plugin_1 = __importDefault(require("mini-css-extract-plugin"));
const semver_1 = __importDefault(require("semver"));
const runtime_config_loader_1 = __importDefault(require("./runtime-config-loader"));
const debug = debug_1.default('ember-auto-import:webpack');
/**
 * Passed to and configuable with autoImport.earlyBootset
 * example:
 * ```js
 * // ember-cli-build.js
 * // ...
 * autoImport: {
 *   earlyBootSet: (defaultModules) => {
 *     return [
 *       ...defaultModules,
 *       'my-package/my-module,
 *     ];
 *   }
 * }
 * ```
 *
 * Anything listed in the return value from this function that is from a v2 addon will be removed.
 * (Allowing each of these packages from the default set to be incrementally converted to v2 addons
 * without the need for this code to be updated)
 *
 */
const DEFAULT_EARLY_BOOT_SET = Object.freeze([
    '@glimmer/tracking',
    '@glimmer/component',
    '@ember/service',
    '@ember/controller',
    '@ember/routing/route',
    '@ember/component',
]);
/**
 * @glimmer/tracking + @glimmer/component
 * are separate addons, yet included in ember-source (for now),
 * but we will be required to use the real glimmer packages before
 * ember-source is converted to v2 (else we implement more hacks at resolver time!)
 */
const BOOT_SET_FROM_EMBER_SOURCE = Object.freeze([
    '@ember/service',
    '@ember/controller',
    '@ember/routing/route',
    '@ember/component',
]);
handlebars_1.registerHelper('js-string-escape', js_string_escape_1.default);
handlebars_1.registerHelper('join', function (list, connector) {
    return list.join(connector);
});
const entryTemplate = handlebars_1.compile(`
module.exports = (function(){
  var d = _eai_d;
  var r = _eai_r;
  window.emberAutoImportDynamic = function(specifier) {
    if (arguments.length === 1) {
      return r('_eai_dyn_' + specifier);
    } else {
      return r('_eai_dynt_' + specifier)(Array.prototype.slice.call(arguments, 1))
    }
  };
  window.emberAutoImportSync = function(specifier) {
    {{! this is only used for synchronous importSync() using a template string }}
    return r('_eai_sync_' + specifier)(Array.prototype.slice.call(arguments, 1))
  };
  d('__v1-addons__early-boot-set__', [{{{v1EmberDeps}}}], function() {});
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', ['__v1-addons__early-boot-set__'], function() { return require('{{js-string-escape module.specifier}}'); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.specifier}}'); });
  {{/each}}
  {{#each staticTemplateImports as |module|}}
    d('_eai_sync_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return require({{{module.template}}});
      }
    });
  {{/each}}
  {{#each dynamicTemplateImports as |module|}}
    d('_eai_dynt_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return import({{{module.template}}});
      }
    });
  {{/each}}
})();
`, { noEscape: true });
// this goes in a file by itself so we can tell webpack not to parse it. That
// allows us to grab the "require" and "define" from our enclosing scope without
// webpack messing with them.
//
// It's important that we're using our enclosing scope and not jumping directly
// to window.require (which would be easier), because the entire Ember app may be
// inside a closure with a "require" that isn't the same as "window.require".
const loader = `
window._eai_r = require;
window._eai_d = define;
`;
class WebpackBundler extends broccoli_plugin_1.default {
    constructor(priorTrees, opts) {
        super(priorTrees, {
            persistentOutput: true,
            needsCache: true,
            annotation: 'ember-auto-import-webpack',
        });
        this.opts = opts;
    }
    get buildResult() {
        if (!this.lastBuildResult) {
            throw new Error(`bug: no buildResult available yet`);
        }
        return this.lastBuildResult;
    }
    get webpack() {
        return this.setup().webpack;
    }
    get stagingDir() {
        return this.setup().stagingDir;
    }
    setup() {
        var _a;
        if (this.state) {
            return this.state;
        }
        // resolve the real path, because we're going to do path comparisons later
        // that could fail if this is not canonical.
        //
        // cast is ok because we passed needsCache to super
        let stagingDir = fs_1.realpathSync(this.cachePath);
        let entry = {};
        this.opts.bundles.names.forEach((bundle) => {
            entry[bundle] = [
                path_1.join(stagingDir, 'l.cjs'),
                path_1.join(stagingDir, `${bundle}.cjs`),
            ];
        });
        let { plugin: stylePlugin, loader: styleLoader } = this.setupStyleLoader();
        let config = {
            mode: this.opts.environment === 'production' ? 'production' : 'development',
            entry,
            performance: {
                hints: false,
            },
            // this controls webpack's own runtime code generation. You still need
            // preset-env to preprocess the libraries themselves (which is already
            // part of this.opts.babelConfig)
            target: `browserslist:${this.opts.browserslist}`,
            output: {
                path: path_1.join(this.outputPath, 'assets'),
                publicPath: this.opts.publicAssetURL,
                filename: `chunk.[id].[chunkhash].js`,
                chunkFilename: `chunk.[id].[chunkhash].js`,
                libraryTarget: 'var',
                library: '__ember_auto_import__',
            },
            optimization: {
                splitChunks: {
                    chunks: 'all',
                },
            },
            resolveLoader: {
                alias: {
                    // these loaders are our dependencies, not the app's dependencies. I'm
                    // not overriding the default loader resolution rules in case the app also
                    // wants to control those.
                    'babel-loader-8': require.resolve('babel-loader'),
                    'eai-style-loader': require.resolve('style-loader'),
                    'eai-css-loader': require.resolve('css-loader'),
                },
            },
            resolve: {
                extensions: ['.js', '.ts', '.json'],
                mainFields: ['browser', 'module', 'main'],
                alias: Object.assign({}, ...removeUndefined([...this.opts.packages].map((pkg) => pkg.aliases))),
            },
            plugins: removeUndefined([stylePlugin]),
            module: {
                noParse: (file) => file === path_1.join(stagingDir, 'l.cjs'),
                rules: [
                    this.babelRule(stagingDir),
                    {
                        test: /\.css$/i,
                        use: [
                            styleLoader,
                            {
                                loader: 'eai-css-loader',
                                options: (_a = [...this.opts.packages].find((pkg) => pkg.cssLoaderOptions)) === null || _a === void 0 ? void 0 : _a.cssLoaderOptions,
                            },
                        ],
                    },
                ],
            },
            node: false,
            externals: this.externalsHandler,
        };
        if ([...this.opts.packages].find((pkg) => pkg.forbidsEval)) {
            config.devtool = 'source-map';
        }
        mergeConfig(config, ...[...this.opts.packages].map((pkg) => pkg.webpackConfig));
        debug('webpackConfig %j', config);
        this.state = { webpack: this.opts.webpack(config), stagingDir };
        return this.state;
    }
    setupStyleLoader() {
        var _a, _b;
        if (this.opts.environment === 'production' || this.opts.hasFastboot) {
            return {
                loader: mini_css_extract_plugin_1.default.loader,
                plugin: new mini_css_extract_plugin_1.default(Object.assign({ filename: `chunk.[id].[chunkhash].css`, chunkFilename: `chunk.[id].[chunkhash].css` }, (_a = [...this.opts.packages].find((pkg) => pkg.miniCssExtractPluginOptions)) === null || _a === void 0 ? void 0 : _a.miniCssExtractPluginOptions)),
            };
        }
        else
            return {
                loader: {
                    loader: 'eai-style-loader',
                    options: (_b = [...this.opts.packages].find((pkg) => pkg.styleLoaderOptions)) === null || _b === void 0 ? void 0 : _b.styleLoaderOptions,
                },
                plugin: undefined,
            };
    }
    skipBabel() {
        let output = [];
        for (let pkg of this.opts.packages) {
            let skip = pkg.skipBabel;
            if (skip) {
                output = output.concat(skip);
            }
        }
        return output;
    }
    babelRule(stagingDir) {
        let shouldTranspile = shared_internals_1.babelFilter(this.skipBabel(), this.opts.appRoot);
        return {
            test(filename) {
                // We don't apply babel to our own stagingDir (it contains only our own
                // entrypoints that we wrote, and it can use `import()`, which we want
                // to leave directly for webpack).
                //
                // And we otherwise defer to the `skipBabel` setting as implemented by
                // `@embroider/shared-internals`.
                return path_1.dirname(filename) !== stagingDir && shouldTranspile(filename);
            },
            use: {
                loader: 'babel-loader-8',
                options: this.opts.babelConfig,
            },
        };
    }
    get externalsHandler() {
        let packageCache = shared_internals_2.PackageCache.shared('ember-auto-import', this.opts.appRoot);
        return function (params, callback) {
            var _a;
            let { context, request } = params;
            if (!context || !request) {
                return callback();
            }
            if (request.startsWith('!')) {
                return callback();
            }
            let name = shared_internals_1.packageName(request);
            if (!name) {
                // we're only interested in handling inter-package resolutions
                return callback();
            }
            let pkg = packageCache.ownerOfFile(context);
            if (!(pkg === null || pkg === void 0 ? void 0 : pkg.isV2Addon())) {
                // we're only interested in imports that appear inside v2 addons
                return callback();
            }
            if ((_a = pkg.meta.externals) === null || _a === void 0 ? void 0 : _a.includes(name)) {
                return callback(undefined, 'commonjs ' + request);
            }
            try {
                let found = packageCache.resolve(name, pkg);
                if (!found.isEmberPackage() || found.isV2Addon()) {
                    // if we're importing a non-ember package or a v2 addon, we don't
                    // externalize. Those are all "normal" looking packages that should be
                    // resolvable statically.
                    return callback();
                }
                else {
                    // the package exists but it is a v1 ember addon, so it's not
                    // resolvable at build time, so we externalize it.
                    return callback(undefined, 'commonjs ' + request);
                }
            }
            catch (err) {
                if (err.code !== 'MODULE_NOT_FOUND') {
                    throw err;
                }
                // real package doesn't exist, so externalize it
                return callback(undefined, 'commonjs ' + request);
            }
        };
    }
    build() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.lastBuildResult) {
                if (new runtime_config_loader_1.default().skipWebpackOnRebuild) {
                    return;
                }
            }
            let bundleDeps = yield this.opts.splitter.deps();
            for (let [bundle, deps] of bundleDeps.entries()) {
                this.writeEntryFile(bundle, deps);
            }
            this.writeLoaderFile();
            this.linkDeps(bundleDeps);
            let stats = yield this.runWebpack();
            this.lastBuildResult = this.summarizeStats(stats, bundleDeps);
        });
    }
    summarizeStats(_stats, bundleDeps) {
        let { entrypoints, assets } = _stats.toJson();
        // webpack's types are written rather loosely, implying that these two
        // properties may not be present. They really always are, as far as I can
        // tell, but we need to check here anyway to satisfy the type checker.
        if (!entrypoints) {
            throw new Error(`unexpected webpack output: no entrypoints`);
        }
        if (!assets) {
            throw new Error(`unexpected webpack output: no assets`);
        }
        let output = {
            entrypoints: new Map(),
            lazyAssets: [],
        };
        let nonLazyAssets = new Set();
        for (let id of Object.keys(entrypoints)) {
            let { assets: entrypointAssets } = entrypoints[id];
            if (!entrypointAssets) {
                throw new Error(`unexpected webpack output: no entrypoint.assets`);
            }
            // our built-in bundles can be "empty" while still existing because we put
            // setup code in them, so they get a special check for non-emptiness.
            // Whereas any other bundle that was manually configured by the user
            // should always be emitted.
            if (!this.opts.bundles.isBuiltInBundleName(id) ||
                nonEmptyBundle(id, bundleDeps)) {
                output.entrypoints.set(id, entrypointAssets.map((a) => 'assets/' + a.name));
            }
            entrypointAssets.forEach((asset) => nonLazyAssets.add(asset.name));
        }
        for (let asset of assets) {
            if (!nonLazyAssets.has(asset.name)) {
                output.lazyAssets.push('assets/' + asset.name);
            }
        }
        return output;
    }
    getEarlyBootSet() {
        let result = this.opts.earlyBootSet
            ? this.opts.earlyBootSet([...DEFAULT_EARLY_BOOT_SET])
            : [];
        /**
         * Prior to ember-source 3.27, the modules were precompiled into a variant of requirejs/AMD.
         * As such, the early boot set will not support earlier than 3.27.
         */
        let host = this.opts.rootPackage;
        let emberSource = host.requestedRange('ember-source');
        let emberSourceVersion = semver_1.default.coerce(emberSource);
        if (emberSourceVersion && semver_1.default.lt(emberSourceVersion, '3.27.0')) {
            if (this.opts.earlyBootSet) {
                throw new Error('autoImport.earlyBootSet is not supported for ember-source <= 3.27.0');
            }
            result = [];
        }
        if (!Array.isArray(result)) {
            throw new Error('autoImport.earlyBootSet was used, but did not return an array. An array of strings is required');
        }
        // Reminder: [/* empty array */].every(anything) is true
        if (!result.every((entry) => typeof entry === 'string')) {
            throw new Error('autoImport.earlyBootSet was used, but the returned array did contained data other than strings. Every element in the return array must be a string representing a module');
        }
        /**
         * TODO: iterate over these and check their dependencies if any depend on a v2 addon
         *       - when this situation occurs, check that v2 addon's dependencies if any of those are v1 addons,
         *         - if so, log a warning, about potentially needing to add modules from that v1 addon to the early boot set
         */
        let v2Addons = this.opts.v2Addons.keys();
        let isEmberSourceV2 = this.opts.v2Addons.has('ember-source');
        function depNameForPath(modulePath) {
            if (modulePath.startsWith('@')) {
                let [scope, name] = modulePath.split('/');
                return `${scope}/${name}`;
            }
            return modulePath.split('/')[0];
        }
        function isFromEmberSource(modulePath) {
            return BOOT_SET_FROM_EMBER_SOURCE.some((fromEmber) => modulePath.startsWith(fromEmber));
        }
        result = result.filter((modulePath) => {
            if (isEmberSourceV2 && isFromEmberSource(modulePath)) {
                return false;
            }
            let depName = depNameForPath(modulePath);
            /**
             * If a dependency from the earlyBootSet is not actually included in the project,
             * don't include in the earlyBootSet emitted content.
             */
            if (!host.hasDependency(depName) && !isFromEmberSource(modulePath)) {
                return false;
            }
            for (let v2Addon of v2Addons) {
                // Omit modulePaths from v2 addons
                if (modulePath.startsWith(v2Addon)) {
                    if (!DEFAULT_EARLY_BOOT_SET.includes(v2Addon)) {
                        console.warn(`\`${modulePath}\` was included in the \`autoImport.earlyBootSet\` list, but belongs to a v2 addon. You can remove this entry from the earlyBootSet`);
                    }
                    return false;
                }
            }
            return true;
        });
        return result;
    }
    writeEntryFile(name, deps) {
        let v1EmberDeps = this.getEarlyBootSet();
        fs_1.writeFileSync(path_1.join(this.stagingDir, `${name}.cjs`), entryTemplate({
            staticImports: deps.staticImports,
            dynamicImports: deps.dynamicImports,
            dynamicTemplateImports: deps.dynamicTemplateImports.map(mapTemplateImports),
            staticTemplateImports: deps.staticTemplateImports.map(mapTemplateImports),
            publicAssetURL: this.opts.publicAssetURL,
            v1EmberDeps: v1EmberDeps.map((name) => `'${name}'`).join(','),
        }));
    }
    writeLoaderFile() {
        fs_1.writeFileSync(path_1.join(this.stagingDir, `l.cjs`), loader);
    }
    linkDeps(bundleDeps) {
        for (let deps of bundleDeps.values()) {
            for (let resolved of deps.staticImports) {
                this.ensureLinked(resolved);
            }
            for (let resolved of deps.dynamicImports) {
                this.ensureLinked(resolved);
            }
            for (let resolved of deps.staticTemplateImports) {
                this.ensureLinked(resolved);
            }
            for (let resolved of deps.dynamicTemplateImports) {
                this.ensureLinked(resolved);
            }
        }
    }
    ensureLinked({ packageName, packageRoot, }) {
        fs_extra_1.ensureDirSync(path_1.dirname(path_1.join(this.stagingDir, 'node_modules', packageName)));
        if (!fs_extra_1.existsSync(path_1.join(this.stagingDir, 'node_modules', packageName))) {
            fs_extra_1.symlinkSync(packageRoot, path_1.join(this.stagingDir, 'node_modules', packageName), 'junction');
        }
    }
    runWebpack() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.webpack.run((err, stats) => {
                    const statsString = stats ? stats.toString() : '';
                    if (err) {
                        this.opts.consoleWrite(statsString);
                        reject(err);
                        return;
                    }
                    if (stats === null || stats === void 0 ? void 0 : stats.hasErrors()) {
                        this.opts.consoleWrite(statsString);
                        reject(new Error('webpack returned errors to ember-auto-import'));
                        return;
                    }
                    if ((stats === null || stats === void 0 ? void 0 : stats.hasWarnings()) || process.env.AUTO_IMPORT_VERBOSE) {
                        this.opts.consoleWrite(statsString);
                    }
                    // this cast is justified because we already checked hasErrors above
                    resolve(stats);
                });
            });
        });
    }
}
__decorate([
    typescript_memoize_1.Memoize()
], WebpackBundler.prototype, "externalsHandler", null);
exports.default = WebpackBundler;
function mergeConfig(dest, ...srcs) {
    return lodash_1.mergeWith(dest, ...srcs, combine);
}
exports.mergeConfig = mergeConfig;
function combine(objValue, srcValue, key) {
    if (key === 'noParse') {
        return eitherPattern(objValue, srcValue);
    }
    if (key === 'externals') {
        return [srcValue, objValue].flat();
    }
    // arrays concat
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}
// webpack configs have several places where they accept:
//   - RegExp
//   - [RegExp]
//   - (resource: string) => boolean
//   - string
//   - [string]
// This function combines any of these with a logical OR.
function eitherPattern(...patterns) {
    let flatPatterns = lodash_1.flatten(patterns);
    return function (resource) {
        for (let pattern of flatPatterns) {
            if (pattern instanceof RegExp) {
                if (pattern.test(resource)) {
                    return true;
                }
            }
            else if (typeof pattern === 'string') {
                if (pattern === resource) {
                    return true;
                }
            }
            else if (typeof pattern === 'function') {
                if (pattern(resource)) {
                    return true;
                }
            }
        }
        return false;
    };
}
function mapTemplateImports(imp) {
    return {
        key: imp.importedBy[0].cookedQuasis.join('${e}'),
        args: imp.expressionNameHints.join(','),
        template: '`' +
            lodash_1.zip(imp.cookedQuasis, imp.expressionNameHints)
                .map(([q, e]) => q + (e ? '${' + e + '}' : ''))
                .join('') +
            '`',
    };
}
function nonEmptyBundle(name, bundleDeps) {
    let deps = bundleDeps.get(name);
    if (!deps) {
        return false;
    }
    return (deps.staticImports.length > 0 ||
        deps.staticTemplateImports.length > 0 ||
        deps.dynamicImports.length > 0 ||
        deps.dynamicTemplateImports.length > 0);
}
// this little helper is needed because typescript can't see through normal
// usage of Array.prototype.filter.
function removeUndefined(list) {
    return list.filter((item) => typeof item !== 'undefined');
}
//# sourceMappingURL=webpack.js.map