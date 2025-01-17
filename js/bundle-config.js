"use strict";
/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const testsPattern = new RegExp(`^(@[^/]+)?/?[^/]+/(tests|test-support)/`);
function exhausted(label, value) {
    throw new Error(`Unknown ${label} specified: ${value}`);
}
class BundleConfig {
    constructor(outputPaths) {
        this.outputPaths = outputPaths;
    }
    // This list of valid bundles, in priority order. The first one in the list that
    // needs a given import will end up with that import.
    get names() {
        return Object.freeze(['app', 'tests']);
    }
    isBuiltInBundleName(name) {
        return this.names.includes(name);
    }
    get types() {
        return Object.freeze(['js', 'css']);
    }
    // Which final JS file the given bundle's dependencies should go into.
    bundleEntrypoint(name, type) {
        switch (name) {
            case 'tests':
                switch (type) {
                    case 'js':
                        return 'assets/test-support.js';
                    case 'css':
                        return 'assets/test-support.css';
                    default:
                        exhausted('test bundle type', type);
                }
            case 'app':
                switch (type) {
                    case 'js':
                        return this.outputPaths.vendor.js.replace(/^\//, '');
                    case 'css':
                        return this.outputPaths.vendor.css.replace(/^\//, '');
                    default:
                        exhausted('app bundle type', type);
                }
            default:
                exhausted('bundle name', name);
        }
    }
    bundleForTreeType(treeType) {
        switch (treeType) {
            case 'app':
            case 'addon':
            case 'addon-templates':
            case 'styles':
            case 'templates':
                return 'app';
            case 'addon-test-support':
            case 'test':
                return 'tests';
            default:
                exhausted('bundle name', treeType);
        }
    }
    // For any relative path to a module in our application, return which bundle its
    // imports go into.
    bundleForPath(path) {
        if (testsPattern.test(path)) {
            return 'tests';
        }
        else {
            return 'app';
        }
    }
    get lazyChunkPath() {
        return path_1.dirname(this.bundleEntrypoint(this.names[0], 'js'));
    }
    htmlEntrypoints() {
        return [this.outputPaths.app.html, 'tests/index.html'];
    }
}
exports.default = BundleConfig;
//# sourceMappingURL=bundle-config.js.map