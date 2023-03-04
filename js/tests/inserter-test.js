"use strict";
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
const qunit_1 = __importDefault(require("qunit"));
require("qunit-assertions-extra");
const broccoli_1 = __importDefault(require("broccoli"));
const broccoli_source_1 = require("broccoli-source");
const quick_temp_1 = __importDefault(require("quick-temp"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const inserter_1 = require("../inserter");
const bundle_config_1 = __importDefault(require("../bundle-config"));
const { module: Qmodule, test } = qunit_1.default;
Qmodule('inserter', function (hooks) {
    let builder;
    let upstream;
    let publicAssetURL;
    let bundleConfig;
    let buildResult;
    let insertScriptsAt;
    let insertStylesAt;
    function build() {
        return __awaiter(this, void 0, void 0, function* () {
            let inserter = new inserter_1.Inserter(new broccoli_source_1.UnwatchedDir(upstream), { buildResult }, bundleConfig, {
                publicAssetURL,
                insertScriptsAt,
                insertStylesAt,
            });
            builder = new broccoli_1.default.Builder(inserter);
            yield builder.build();
        });
    }
    function writeIndex(src) {
        fs_extra_1.outputFileSync(path_1.join(upstream, 'index.html'), src);
    }
    function readIndex() {
        return fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'index.html'), 'utf8');
    }
    hooks.beforeEach(function () {
        quick_temp_1.default.makeOrRemake(this, 'workDir', 'auto-import-inserter-tests');
        fs_extra_1.ensureDirSync((upstream = path_1.join(this.workDir, 'upstream')));
        buildResult = {
            entrypoints: new Map(),
            lazyAssets: [],
        };
        bundleConfig = new bundle_config_1.default({
            app: {
                html: 'index.html',
            },
            vendor: { css: '/assets/vendor.css', js: '/assets/vendor.js' },
        });
        publicAssetURL = '/assets/';
    });
    hooks.afterEach(function () {
        fs_extra_1.removeSync(this.workDir);
        if (builder) {
            return builder.cleanup();
        }
    });
    test('does not error when we have nothing to insert', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            writeIndex('');
            yield build();
            assert.expect(0);
        });
    });
    test('errors when we cannot find a place for app js', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            writeIndex('');
            try {
                yield build();
                throw new Error('should not get here');
            }
            catch (err) {
                assert.contains(err.message, 'ember-auto-import could not find a place to insert app scripts in index.html');
            }
        });
    });
    test('errors when we cannot find a place for app css', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            writeIndex('');
            try {
                yield build();
                throw new Error('should not get here');
            }
            catch (err) {
                assert.contains(err.message, 'ember-auto-import could not find a place to insert app styles in index.html');
            }
        });
    });
    test('inserts app scripts after vendor.js', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            writeIndex(`<script src="/assets/vendor.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>`);
        });
    });
    test('inserts fastboot scripts when using newer fastboot manifest', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            buildResult.lazyAssets.push('assets/chunk.2.js');
            writeIndex(`<script src="/assets/vendor.js"></script>`);
            fs_extra_1.outputFileSync(path_1.join(upstream, 'package.json'), JSON.stringify({
                fastboot: {
                    schemaVersion: 5,
                },
            }));
            yield build();
            assert.equal(readIndex(), `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>\n<fastboot-script src="/assets/chunk.2.js"></fastboot-script>`);
        });
    });
    test('inserts scripts into older fastboot manifest', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            buildResult.lazyAssets.push('assets/chunk.2.js');
            writeIndex(`<script src="/assets/vendor.js"></script>`);
            fs_extra_1.outputFileSync(path_1.join(upstream, 'package.json'), JSON.stringify({
                fastboot: {
                    schemaVersion: 3,
                    manifest: {
                        vendorFiles: ['something.js'],
                    },
                },
            }));
            yield build();
            assert.equal(readIndex(), `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>`);
            assert.deepEqual(fs_extra_1.readJSONSync(path_1.join(builder.outputPath, 'package.json')), {
                fastboot: {
                    schemaVersion: 3,
                    manifest: {
                        vendorFiles: [
                            'something.js',
                            'assets/chunk.1.js',
                            'assets/chunk.2.js',
                        ],
                    },
                },
            });
        });
    });
    test('inserts app styles after vendor.css', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            writeIndex(`<link rel="stylesheet" href="/assets/vendor.css"/>`);
            yield build();
            assert.equal(readIndex(), `<link rel="stylesheet" href="/assets/vendor.css"/>\n<link rel="stylesheet" href="/assets/chunk.1.css"/>`);
        });
    });
    test('inserts app scripts after customized vendor.js', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            bundleConfig = new bundle_config_1.default({
                app: {
                    html: 'index.html',
                },
                vendor: { css: '/assets/vendor.css', js: '/assets/rodnev.js' },
            });
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            writeIndex(`<script src="/assets/rodnev.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<script src="/assets/rodnev.js"></script>\n<script src="/assets/chunk.1.js"></script>`);
        });
    });
    test('inserts app styles after customized vendor.css', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            bundleConfig = new bundle_config_1.default({
                app: {
                    html: 'index.html',
                },
                vendor: { css: '/assets/rodnev.css', js: '/assets/rodnev.js' },
            });
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            writeIndex(`<link rel="stylesheet" href="/assets/rodnev.css"/>`);
            yield build();
            assert.equal(readIndex(), `<link rel="stylesheet" href="/assets/rodnev.css"/>\n<link rel="stylesheet" href="/assets/chunk.1.css"/>`);
        });
    });
    test('uses customized publicAssetURL for JS', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            publicAssetURL = 'https://cdn.com/4321/assets/';
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            writeIndex(`<script src="/assets/vendor.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<script src="/assets/vendor.js"></script>\n<script src="https://cdn.com/4321/assets/chunk.1.js"></script>`);
        });
    });
    test('uses customized publicAssetURL for css', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            publicAssetURL = 'https://cdn.com/4321/assets/';
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            writeIndex(`<link rel="stylesheet" href="/assets/vendor.css"/>`);
            yield build();
            assert.equal(readIndex(), `<link rel="stylesheet" href="/assets/vendor.css"/>\n<link rel="stylesheet" href="https://cdn.com/4321/assets/chunk.1.css"/>`);
        });
    });
    test('can customize script insertion location', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            insertScriptsAt = 'auto-import-script';
            writeIndex(`<auto-import-script entrypoint="app"></auto-import-script>\n<script src="/assets/vendor.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<script src="/assets/chunk.1.js"></script>\n<script src="/assets/vendor.js"></script>`);
        });
    });
    test('customized script insertion supports fastboot-script', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            buildResult.lazyAssets.push('assets/chunk.2.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'package.json'), JSON.stringify({
                fastboot: {
                    schemaVersion: 5,
                },
            }));
            insertScriptsAt = 'auto-import-script';
            writeIndex(`<auto-import-script entrypoint="app" data-foo="bar"></auto-import-script>\n<script src="/assets/vendor.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<script src="/assets/chunk.1.js" data-foo="bar"></script>\n<fastboot-script src="/assets/chunk.2.js" data-foo="bar"></fastboot-script>\n<script src="/assets/vendor.js"></script>`);
        });
    });
    test('can customize attributes on inserted script', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            insertScriptsAt = 'auto-import-script';
            writeIndex(`<div><auto-import-script entrypoint="app" defer data-foo="bar"></auto-import-script></div>`);
            yield build();
            assert.equal(readIndex(), `<div><script src="/assets/chunk.1.js" defer data-foo="bar"></script></div>`);
        });
    });
    test('removes unused custom script element', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            insertScriptsAt = 'auto-import-script';
            writeIndex(`<div><auto-import-script entrypoint="app"></auto-import-script></div><script src="/assets/vendor.js"></script>`);
            yield build();
            assert.equal(readIndex(), `<div></div><script src="/assets/vendor.js"></script>`);
        });
    });
    test('errors when custom script element is missing entrypoint', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            insertScriptsAt = 'auto-import-script';
            writeIndex('<auto-import-script />');
            try {
                yield build();
                throw new Error('should not get here');
            }
            catch (err) {
                assert.contains(err.message, '<auto-import-script/> element in index.html is missing required entrypoint attribute');
            }
        });
    });
    test('errors when custom element is configured but not present', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
            insertScriptsAt = 'auto-import-script';
            writeIndex('<uto-import-script entrypoint="app"></uto-import-script>');
            try {
                yield build();
                throw new Error('should not get here');
            }
            catch (err) {
                assert.contains(err.message, 'ember-auto-import cannot find <auto-import-script entrypoint="app"> in index.html');
            }
        });
    });
    test('can customize style insertion location', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            insertStylesAt = 'auto-import-style';
            writeIndex(`<auto-import-style entrypoint="app"></auto-import-style>\n<link rel="stylesheet" href="/assets/vendor.css"/>`);
            yield build();
            assert.equal(readIndex(), `<link rel="stylesheet" href="/assets/chunk.1.css"/>\n<link rel="stylesheet" href="/assets/vendor.css"/>`);
        });
    });
    test('can customize attributes on inserted style', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            insertScriptsAt = 'auto-import-style';
            writeIndex(`<div><auto-import-style entrypoint="app" data-baz data-foo="bar"></auto-import-style></div>`);
            yield build();
            assert.equal(readIndex(), `<div><link rel="stylesheet" href="/assets/chunk.1.css" data-baz data-foo="bar"/></div>`);
        });
    });
    test('removes unused custom style element', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            insertScriptsAt = 'auto-import-style';
            writeIndex(`<div><auto-import-style entrypoint="app"></auto-import-style></div><link rel="styleshee" href="/assets/vendor.css"/>`);
            yield build();
            assert.equal(readIndex(), `<div></div><link rel="styleshee" href="/assets/vendor.css"/>`);
        });
    });
    test('errors when custom style element is missing entrypoint', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
            insertStylesAt = 'auto-import-style';
            writeIndex('<auto-import-style></auto-import-style');
            try {
                yield build();
                throw new Error('should not get here');
            }
            catch (err) {
                assert.contains(err.message, '<auto-import-style/> element in index.html is missing required entrypoint attribute');
            }
        });
    });
});
//# sourceMappingURL=inserter-test.js.map