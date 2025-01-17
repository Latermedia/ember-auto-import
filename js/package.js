"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadDevPackages = void 0;
const resolve_package_path_1 = __importDefault(require("resolve-package-path"));
const path_1 = require("path");
const fs_1 = require("fs");
const typescript_memoize_1 = require("typescript-memoize");
const shared_internals_1 = require("@embroider/shared-internals");
const semver_1 = __importDefault(require("semver"));
const node_1 = require("@embroider/macros/src/node");
// from child addon instance to their parent package
const parentCache = new WeakMap();
// from an addon instance or project to its package
const packageCache = new WeakMap();
let pkgGeneration = 0;
function reloadDevPackages() {
    pkgGeneration++;
}
exports.reloadDevPackages = reloadDevPackages;
class Package {
    constructor(child) {
        this._hasBabelDetails = false;
        this.name = child.parent.pkg.name;
        if (shared_internals_1.isDeepAddonInstance(child)) {
            this.root = this.pkgRoot = child.parent.root;
            this.isAddon = true;
            this.isDeveloping = this.root === child.project.root;
            // This is the per-package options from ember-cli
            this._options = child.parent.options;
        }
        else {
            // this can differ from child.parent.root because Dummy apps are terrible
            this.root = path_1.join(child.project.configPath(), '..', '..');
            this.pkgRoot = child.parent.root;
            this.isAddon = false;
            this.isDeveloping = true;
            this._options = child.app.options;
            this.macrosConfig = node_1.MacrosConfig.for(child.app, this.root);
        }
        this._parent = child.parent;
        // Stash our own config options
        this.autoImportOptions = this._options.autoImport;
        this.pkgCache = child.parent.pkg;
        this.pkgGeneration = pkgGeneration;
    }
    static lookupParentOf(child) {
        if (!parentCache.has(child)) {
            let pkg = packageCache.get(child.parent);
            if (!pkg) {
                pkg = new this(child);
                packageCache.set(child.parent, pkg);
            }
            parentCache.set(child, pkg);
        }
        return parentCache.get(child);
    }
    _ensureBabelDetails() {
        if (this._hasBabelDetails) {
            return;
        }
        let { babelOptions, extensions, version } = this.buildBabelOptions(this._parent, this._options);
        this._emberCLIBabelExtensions = extensions;
        this._babelOptions = babelOptions;
        this._babelMajorVersion = version;
        this._hasBabelDetails = true;
    }
    get babelOptions() {
        this._ensureBabelDetails();
        return this._babelOptions;
    }
    get babelMajorVersion() {
        this._ensureBabelDetails();
        return this._babelMajorVersion;
    }
    get isFastBootEnabled() {
        return (process.env.FASTBOOT_DISABLED !== 'true' &&
            this._parent.addons.some((addon) => addon.name === 'ember-cli-fastboot'));
    }
    buildBabelOptions(instance, options) {
        // Generate the same babel options that the package (meaning app or addon)
        // is using. We will use these so we can configure our parser to
        // match.
        let babelAddon = instance.addons.find((addon) => addon.name === 'ember-cli-babel');
        let version = parseInt(babelAddon.pkg.version.split('.')[0], 10);
        let babelOptions, extensions;
        babelOptions = babelAddon.buildBabelOptions(options);
        extensions = babelOptions.filterExtensions || ['js'];
        // https://github.com/babel/ember-cli-babel/issues/227
        delete babelOptions.annotation;
        delete babelOptions.throwUnlessParallelizable;
        delete babelOptions.filterExtensions;
        if (babelOptions.plugins) {
            babelOptions.plugins = babelOptions.plugins.filter((p) => !p._parallelBabel);
        }
        return { babelOptions, extensions, version };
    }
    get pkg() {
        if (!this.pkgCache ||
            (this.isDeveloping && pkgGeneration !== this.pkgGeneration)) {
            // avoiding `require` here because we don't want to go through the
            // require cache.
            this.pkgCache = JSON.parse(fs_1.readFileSync(path_1.join(this.pkgRoot, 'package.json'), 'utf-8'));
            this.pkgGeneration = pkgGeneration;
        }
        return this.pkgCache;
    }
    get namespace() {
        // This namespacing ensures we can be used by multiple packages as
        // well as by an addon and its dummy app simultaneously
        return `${this.name}/${this.isAddon ? 'addon' : 'app'}`;
    }
    hasDependency(name) {
        var _a, _b, _c, _d;
        let { pkg } = this;
        return Boolean(((_a = pkg.dependencies) === null || _a === void 0 ? void 0 : _a[name]) ||
            ((_b = pkg.devDependencies) === null || _b === void 0 ? void 0 : _b[name]) ||
            ((_c = pkg.peerDependencies) === null || _c === void 0 ? void 0 : _c[name]) ||
            ((_d = this.magicDeps) === null || _d === void 0 ? void 0 : _d.get(name)));
    }
    // the semver range of the given package that our package requests in
    // package.json
    requestedRange(packageName) {
        var _a, _b, _c;
        let { pkg } = this;
        return (((_a = pkg.dependencies) === null || _a === void 0 ? void 0 : _a[packageName]) ||
            ((_b = pkg.devDependencies) === null || _b === void 0 ? void 0 : _b[packageName]) ||
            ((_c = pkg.peerDependencies) === null || _c === void 0 ? void 0 : _c[packageName]));
    }
    hasNonDevDependency(name) {
        var _a, _b, _c;
        let pkg = this.pkg;
        return Boolean(((_a = pkg.dependencies) === null || _a === void 0 ? void 0 : _a[name]) ||
            ((_b = pkg.peerDependencies) === null || _b === void 0 ? void 0 : _b[name]) ||
            ((_c = this.magicDeps) === null || _c === void 0 ? void 0 : _c.has(name)));
    }
    static categorize(importedPath, partial = false) {
        if (/^(\w+:)?\/\//.test(importedPath) || importedPath.startsWith('data:')) {
            return 'url';
        }
        if (importedPath[0] === '.' || importedPath[0] === '/') {
            return 'local';
        }
        if (partial && !isPrecise(importedPath)) {
            return 'imprecise';
        }
        return 'dep';
    }
    resolve(importedPath, fromPath, partial = false) {
        var _a;
        switch (Package.categorize(importedPath, partial)) {
            case 'url':
                return { type: 'url', url: importedPath };
            case 'local':
                return {
                    type: 'local',
                    local: importedPath,
                };
            case 'imprecise':
                if (partial) {
                    return {
                        type: 'imprecise',
                    };
                }
                break;
        }
        let path = this.aliasFor(importedPath);
        let packageName = shared_internals_1.packageName(path);
        if (!packageName) {
            // this can only happen if the user supplied an alias that points at a
            // relative or absolute path, rather than a package name. If the
            // originally authored import was an absolute or relative path, it would
            // have hit our { type: 'local' } condition before we ran aliasFor.
            //
            // At the moment, we don't try to handle this case, but we could in the
            // future.
            return {
                type: 'local',
                local: path,
            };
        }
        if (this.excludesDependency(packageName)) {
            // This package has been explicitly excluded.
            return;
        }
        if (!this.hasDependency(packageName)) {
            return;
        }
        let packageRoot;
        let packagePath = resolve_package_path_1.default(packageName, this.root);
        if (packagePath) {
            packageRoot = path_1.dirname(packagePath);
        }
        if (!packageRoot) {
            packageRoot = (_a = this.magicDeps) === null || _a === void 0 ? void 0 : _a.get(packageName);
        }
        if (packageRoot == null) {
            throw new Error(`${this.name} tried to import "${packageName}" in "${fromPath}" but the package was not resolvable from ${this.root}`);
        }
        if (isV1EmberAddonDependency(packageRoot)) {
            // ember addon are not auto imported
            return;
        }
        this.assertAllowedDependency(packageName, fromPath);
        return {
            type: 'package',
            path,
            packageName,
            packageRoot,
        };
    }
    assertAllowedDependency(name, fromPath) {
        if (this.isAddon && !this.hasNonDevDependency(name)) {
            throw new Error(`${this.name} tried to import "${name}" in "${fromPath}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`);
        }
    }
    excludesDependency(name) {
        return Boolean(this.autoImportOptions &&
            this.autoImportOptions.exclude &&
            this.autoImportOptions.exclude.includes(name));
    }
    get webpackConfig() {
        return this.autoImportOptions && this.autoImportOptions.webpack;
    }
    get skipBabel() {
        return this.autoImportOptions && this.autoImportOptions.skipBabel;
    }
    get aliases() {
        var _a;
        return (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.alias;
    }
    // this follows the same rules as webpack's resolve.alias. It's a prefix
    // match, unless the configured pattern ends with "$" in which case that means
    // exact match.
    aliasFor(name) {
        var _a;
        let alias = (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.alias;
        if (!alias) {
            return name;
        }
        let exactMatch = alias[`${name}$`];
        if (exactMatch) {
            return exactMatch;
        }
        let prefixMatch = Object.keys(alias).find((pattern) => name.startsWith(pattern));
        if (prefixMatch && alias[prefixMatch]) {
            return alias[prefixMatch] + name.slice(prefixMatch.length);
        }
        return name;
    }
    get fileExtensions() {
        this._ensureBabelDetails();
        // type safety: this will have been populated by the call above
        return this._emberCLIBabelExtensions;
    }
    publicAssetURL() {
        var _a, _b;
        if (this.isAddon) {
            throw new Error(`bug: only the app should control publicAssetURL`);
        }
        return ensureTrailingSlash((_b = (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.publicAssetURL) !== null && _b !== void 0 ? _b : ensureTrailingSlash(this._parent.config().rootURL) + 'assets/');
    }
    /**
     * The function for defining the early boot set.
     * Used when we begin building entry files for webpack, so that we can query all packages listed
     * in the early boot set to check if they are v2 addons --if they are v2 addons,
     * we remove them from the early boot set, as this feature is for a rare compatibility circumstance that
     * only affects v1 addons consumed by v2 addons.
     */
    get earlyBootSet() {
        var _a;
        return this.isAddon ? undefined : (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.earlyBootSet;
    }
    get styleLoaderOptions() {
        var _a;
        // only apps (not addons) are allowed to set this
        return this.isAddon
            ? undefined
            : (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.styleLoaderOptions;
    }
    get cssLoaderOptions() {
        var _a;
        // only apps (not addons) are allowed to set this
        return this.isAddon ? undefined : (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.cssLoaderOptions;
    }
    get miniCssExtractPluginOptions() {
        var _a;
        // only apps (not addons) are allowed to set this
        return this.isAddon
            ? undefined
            : (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.miniCssExtractPluginOptions;
    }
    get forbidsEval() {
        // only apps (not addons) are allowed to set this, because it's motivated by
        // the apps own Content Security Policy.
        return Boolean(!this.isAddon &&
            this.autoImportOptions &&
            this.autoImportOptions.forbidEval);
    }
    get insertScriptsAt() {
        var _a;
        if (this.isAddon) {
            throw new Error(`bug: only apps should control insertScriptsAt`);
        }
        return (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.insertScriptsAt;
    }
    get insertStylesAt() {
        var _a;
        if (this.isAddon) {
            throw new Error(`bug: only apps should control insertStylesAt`);
        }
        return (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.insertStylesAt;
    }
    get watchedDirectories() {
        var _a;
        // only apps (not addons) are allowed to set this
        if (!this.isAddon && ((_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.watchDependencies)) {
            return this.autoImportOptions.watchDependencies
                .map((nameOrNames) => {
                let names;
                if (typeof nameOrNames === 'string') {
                    names = [nameOrNames];
                }
                else {
                    names = nameOrNames;
                }
                let cursor = this.root;
                for (let name of names) {
                    let path = resolve_package_path_1.default(name, cursor);
                    if (!path) {
                        return undefined;
                    }
                    cursor = path_1.dirname(path);
                }
                return cursor;
            })
                .filter(Boolean);
        }
    }
    cleanBabelConfig() {
        if (this.isAddon) {
            throw new Error(`Only the app can generate auto-import's babel config`);
        }
        // casts here are safe because we just checked isAddon is false
        let parent = this._parent;
        let macrosConfig = this.macrosConfig;
        let emberSource = parent.addons.find((addon) => addon.name === 'ember-source');
        if (!emberSource) {
            throw new Error(`failed to find ember-source in addons of ${this.name}`);
        }
        let ensureModuleApiPolyfill = semver_1.default.satisfies(emberSource.pkg.version, '<3.27.0', { includePrerelease: true });
        let templateCompilerPath = emberSource.absolutePaths
            .templateCompiler;
        let plugins = [
            [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
            [
                require.resolve('@babel/plugin-proposal-class-properties'),
                { loose: false },
            ],
            [
                require.resolve('babel-plugin-htmlbars-inline-precompile'),
                {
                    ensureModuleApiPolyfill,
                    templateCompilerPath,
                    modules: {
                        'ember-cli-htmlbars': 'hbs',
                        '@ember/template-compilation': {
                            export: 'precompileTemplate',
                            disableTemplateLiteral: true,
                            shouldParseScope: true,
                            isProduction: process.env.EMBER_ENV === 'production',
                        },
                    },
                },
            ],
            ...macrosConfig.babelPluginConfig(),
        ];
        if (ensureModuleApiPolyfill) {
            plugins.push([
                require.resolve('babel-plugin-ember-modules-api-polyfill'),
            ]);
        }
        return {
            // do not use the host project's own `babel.config.js` file. Only a strict
            // subset of features are allowed in the third-party code we're
            // transpiling.
            //
            // - every package gets babel preset-env unless skipBabel is configured
            //   for them.
            // - because we process v2 ember packages, we enable inline hbs (with no
            //   custom transforms) and modules-api-polyfill
            configFile: false,
            babelrc: false,
            // leaving this unset can generate an unhelpful warning from babel on
            // large files like 'Note: The code generator has deoptimised the
            // styling of... as it exceeds the max of 500KB."
            generatorOpts: {
                compact: true,
            },
            plugins,
            presets: [
                [
                    require.resolve('@babel/preset-env'),
                    {
                        modules: false,
                        targets: parent.targets,
                    },
                ],
            ],
        };
    }
    browserslist() {
        if (this.isAddon) {
            throw new Error(`Only the app can determine the browserslist`);
        }
        // cast here is safe because we just checked isAddon is false
        let parent = this._parent;
        return parent.targets.browsers.join(',');
    }
}
__decorate([
    typescript_memoize_1.Memoize()
], Package.prototype, "isFastBootEnabled", null);
exports.default = Package;
const isAddonCache = new Map();
function isV1EmberAddonDependency(packageRoot) {
    var _a, _b, _c;
    let cached = isAddonCache.get(packageRoot);
    if (cached === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let packageJSON = require(path_1.join(packageRoot, 'package.json'));
        let answer = ((_a = packageJSON.keywords) === null || _a === void 0 ? void 0 : _a.includes('ember-addon')) &&
            ((_c = (_b = packageJSON['ember-addon']) === null || _b === void 0 ? void 0 : _b.version) !== null && _c !== void 0 ? _c : 1) < 2;
        isAddonCache.set(packageRoot, answer);
        return answer;
    }
    else {
        return cached;
    }
}
function count(str, letter) {
    return [...str].reduce((a, b) => a + (b === letter ? 1 : 0), 0);
}
function isPrecise(leadingQuasi) {
    if (leadingQuasi.startsWith('.') || leadingQuasi.startsWith('/')) {
        return true;
    }
    let slashes = count(leadingQuasi, '/');
    let minSlashes = leadingQuasi.startsWith('@') ? 2 : 1;
    return slashes >= minSlashes;
}
function ensureTrailingSlash(url) {
    if (url[url.length - 1] !== '/') {
        url = url + '/';
    }
    return url;
}
//# sourceMappingURL=package.js.map