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
const splitter_1 = __importDefault(require("./splitter"));
const bundler_1 = require("./bundler");
const analyzer_1 = __importDefault(require("./analyzer"));
const package_1 = __importDefault(require("./package"));
const broccoli_debug_1 = require("broccoli-debug");
const bundle_config_1 = __importDefault(require("./bundle-config"));
const leader_1 = require("./leader");
const shared_internals_1 = require("@embroider/shared-internals");
const webpack_1 = __importDefault(require("./webpack"));
const typescript_memoize_1 = require("typescript-memoize");
const broccoli_source_1 = require("broccoli-source");
const inserter_1 = require("./inserter");
const broccoli_merge_trees_1 = __importDefault(require("broccoli-merge-trees"));
const resolve_1 = __importDefault(require("resolve"));
const resolve_package_path_1 = __importDefault(require("resolve-package-path"));
const semver_1 = __importDefault(require("semver"));
const analyzer_syntax_1 = require("./analyzer-syntax");
const path_1 = __importDefault(require("path"));
const debugTree = broccoli_debug_1.buildDebugCallback('ember-auto-import');
class AutoImport {
    constructor(addonInstance) {
        this.packages = new Set();
        this.analyzers = new Map();
        // maps packageName to packageRoot
        this.v2Addons = new Map();
        let topmostAddon = shared_internals_1.findTopmostAddon(addonInstance);
        this.packages.add(package_1.default.lookupParentOf(topmostAddon));
        let host = topmostAddon.app;
        this.env = host.env;
        this.bundles = new bundle_config_1.default(host.options.outputPaths);
        if (!this.env) {
            throw new Error('Bug in ember-auto-import: did not discover environment');
        }
        this.consoleWrite = (...args) => addonInstance.project.ui.write(...args);
    }
    static register(addon) {
        leader_1.LeaderChooser.for(addon).register(addon, () => new AutoImport(addon));
    }
    static lookup(addon) {
        return leader_1.LeaderChooser.for(addon).leader;
    }
    // we don't actually call this ourselves anymore, but earlier versions of
    // ember-auto-import will still call it on us. For them the answer is always
    // false.
    isPrimary(_addon) {
        return false;
    }
    analyze(tree, addon, treeType, supportsFastAnalyzer) {
        let pack = package_1.default.lookupParentOf(addon);
        this.packages.add(pack);
        let analyzer = new analyzer_1.default(debugTree(tree, `preprocessor:input-${this.analyzers.size}`), pack, treeType, supportsFastAnalyzer);
        this.analyzers.set(analyzer, pack);
        return analyzer;
    }
    registerV2Addon(packageName, packageRoot) {
        this.v2Addons.set(packageName, packageRoot);
    }
    makeBundler(allAppTree) {
        // this is a concession to compatibility with ember-cli's treeForApp
        // merging. Addons are allowed to inject modules into the app, and it's
        // extremely common that those modules want to import from the addons
        // themselves, even though this jumps arbitrarily many levels in the
        // dependency graph.
        //
        // Since we handle v2 addons, we need to make sure all v2 addons function as
        // "dependencies" of the app even though they're not really.
        this.rootPackage.magicDeps = this.v2Addons;
        // The Splitter takes the set of imports from the Analyzer and
        // decides which ones to include in which bundles
        let splitter = new splitter_1.default({
            analyzers: this.analyzers,
            bundles: this.bundles,
        });
        let webpack;
        const pkg = resolve_package_path_1.default('webpack', this.rootPackage.root);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        if (pkg && semver_1.default.satisfies(require(pkg).version, '^5.0.0')) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            webpack = require(resolve_1.default.sync('webpack', {
                basedir: this.rootPackage.root,
            }));
        }
        else {
            throw new Error(`[ember-auto-import] this version of ember-auto-import requires the app to have a dependency on webpack 5`);
        }
        // The Bundler asks the splitter for deps it should include and
        // is responsible for packaging those deps up.
        return new webpack_1.default(depsFor(allAppTree, this.packages), {
            splitter,
            environment: this.env,
            packages: this.packages,
            appRoot: this.rootPackage.root,
            consoleWrite: this.consoleWrite,
            bundles: this.bundles,
            babelConfig: this.rootPackage.cleanBabelConfig(),
            browserslist: this.rootPackage.browserslist(),
            publicAssetURL: this.rootPackage.publicAssetURL(),
            webpack,
            hasFastboot: this.rootPackage.isFastBootEnabled,
            earlyBootSet: this.rootPackage.earlyBootSet,
            v2Addons: this.v2Addons,
            rootPackage: this.rootPackage,
        });
    }
    get rootPackage() {
        let rootPackage = [...this.packages.values()].find((pkg) => !pkg.isAddon);
        if (!rootPackage) {
            throw new Error(`bug in ember-auto-import, there should always be a Package representing the app`);
        }
        return rootPackage;
    }
    addTo(allAppTree) {
        let bundler = bundler_1.debugBundler(this.makeBundler(allAppTree), 'output');
        let inserter = new inserter_1.Inserter(allAppTree, bundler, this.bundles, {
            publicAssetURL: this.rootPackage.publicAssetURL(),
            insertScriptsAt: this.rootPackage.insertScriptsAt,
            insertStylesAt: this.rootPackage.insertStylesAt,
        });
        let trees = [allAppTree, bundler, inserter];
        return broccoli_merge_trees_1.default(trees, { overwrite: true });
    }
    // CAUTION: versions <= 2.1.0 only invoked this method on the app's copy of
    // ember-auto-import, whereas we now invoke it on every copy. That means you
    // can't guarantee this will be called for an addon that is using one of those
    // older versions.
    included(addonInstance) {
        this.installBabelPlugin(addonInstance);
        if (!shared_internals_1.isDeepAddonInstance(addonInstance)) {
            this.configureFingerprints(addonInstance.app);
        }
    }
    installBabelPlugin(addonInstance) {
        let parent;
        if (shared_internals_1.isDeepAddonInstance(addonInstance)) {
            parent = addonInstance.parent;
        }
        else {
            parent = addonInstance.app;
        }
        let babelOptions = (parent.options.babel =
            parent.options.babel || {});
        let babelPlugins = (babelOptions.plugins = babelOptions.plugins || []);
        if (!babelPlugins.some(isAnalyzerPlugin)) {
            // the MARKER is included so that babel caches will invalidate if the
            // MARKER changes
            babelPlugins.unshift([require.resolve('./analyzer-plugin'), { MARKER: analyzer_syntax_1.MARKER }]);
        }
    }
    // We need to disable fingerprinting of chunks, because (1) they already
    // have their own webpack-generated hashes and (2) the runtime loader code
    // can't easily be told about broccoli-asset-rev's hashes.
    configureFingerprints(host) {
        let patterns = ['assets/chunk.*.js', 'assets/chunk.*.css'];
        if (!host.options.fingerprint) {
            host.options.fingerprint = {};
        }
        if (!('exclude' in host.options.fingerprint)) {
            host.options.fingerprint.exclude = patterns;
        }
        else {
            for (let pattern of patterns) {
                host.options.fingerprint.exclude.push(pattern);
            }
        }
    }
}
__decorate([
    typescript_memoize_1.Memoize()
], AutoImport.prototype, "rootPackage", null);
exports.default = AutoImport;
function depsFor(allAppTree, packages) {
    let deps = [allAppTree];
    for (let pkg of packages) {
        let watched = pkg.watchedDirectories;
        if (watched) {
            deps = deps.concat(watched.map((dir) => new broccoli_source_1.WatchedDir(dir)));
        }
    }
    return deps;
}
function isAnalyzerPlugin(entry) {
    const suffix = path_1.default.join('ember-auto-import', 'js', 'analyzer-plugin.js');
    return ((typeof entry === 'string' && entry.endsWith(suffix)) ||
        (Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            entry[0].endsWith(suffix)));
}
//# sourceMappingURL=auto-import.js.map