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
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const package_1 = __importDefault(require("../package"));
const analyzer_1 = __importDefault(require("../analyzer"));
const splitter_1 = __importDefault(require("../splitter"));
const bundle_config_1 = __importDefault(require("../bundle-config"));
const scenario_tester_1 = require("scenario-tester");
const lodash_1 = require("lodash");
// @ts-ignore
const broccoli_babel_transpiler_1 = __importDefault(require("broccoli-babel-transpiler"));
const { module: Qmodule, test } = qunit_1.default;
Qmodule('splitter', function (hooks) {
    let builder;
    let project;
    let pack;
    let splitter;
    let setup;
    hooks.beforeEach(function () {
        project = new scenario_tester_1.Project('my-app');
        let alpha = project.addDependency('alpha');
        lodash_1.merge(alpha.files, {
            'index.js': '',
            mod: {
                'index.js': '',
            },
        });
        let beta = project.addDependency('@beta/thing');
        lodash_1.merge(beta.files, {
            'index.js': '',
            mod: {
                'index.js': '',
            },
        });
        project.addDevDependency('aliasing-example', {
            files: {
                'outside.js': `export default function() {}`,
                dist: {
                    'inside.js': `export default function() {}`,
                    'index.js': `export default function() {}`,
                },
            },
        });
        project.writeSync();
        setup = function (options = {}) {
            pack = new package_1.default(stubAddonInstance(project.baseDir, options));
            let transpiled = broccoli_babel_transpiler_1.default(new broccoli_source_1.UnwatchedDir(project.baseDir), {
                plugins: [
                    require.resolve('../../js/analyzer-plugin'),
                    require.resolve('@babel/plugin-syntax-typescript'),
                    // keeping this in non-parallelizable form prevents
                    // broccoli-babel-transpiler from spinning up separate worker processes,
                    // which we don't want or need and which hang at the end of the test
                    // suite.
                    require('../../babel-plugin'),
                ],
            });
            let analyzer = new analyzer_1.default(transpiled, pack, undefined, true);
            splitter = new splitter_1.default({
                bundles: new bundle_config_1.default({
                    vendor: {
                        js: 'assets/vendor.js',
                        css: 'assetes/vendor.css',
                    },
                    app: {
                        html: 'index.html',
                    },
                }),
                analyzers: new Map([[analyzer, pack]]),
            });
            builder = new broccoli_1.default.Builder(analyzer);
        };
        setup();
    });
    hooks.afterEach(function () {
        if (builder) {
            return builder.cleanup();
        }
        project.dispose();
    });
    let handledImportCallExamples = [
        ["'alpha'", { specifier: 'alpha', packageName: 'alpha' }],
        ["'@beta/thing'", { specifier: '@beta/thing', packageName: '@beta/thing' }],
        ['`alpha`', { specifier: 'alpha', packageName: 'alpha' }],
        ['`@beta/thing`', { specifier: '@beta/thing', packageName: '@beta/thing' }],
        ["'alpha/mod'", { specifier: 'alpha/mod', packageName: 'alpha' }],
        [
            "'@beta/thing/mod'",
            { specifier: '@beta/thing/mod', packageName: '@beta/thing' },
        ],
        ['`alpha/mod`', { specifier: 'alpha/mod', packageName: 'alpha' }],
        [
            '`@beta/thing/mod`',
            { specifier: '@beta/thing/mod', packageName: '@beta/thing' },
        ],
        [
            '`alpha/${foo}`',
            { quasis: ['alpha/', ''], expressions: ['foo'], packageName: 'alpha' },
        ],
        [
            '`alpha/in${foo}`',
            { quasis: ['alpha/in', ''], expressions: ['foo'], packageName: 'alpha' },
        ],
        [
            '`@beta/thing/${foo}`',
            {
                quasis: ['@beta/thing/', ''],
                expressions: ['foo'],
                packageName: '@beta/thing',
            },
        ],
        [
            '`@beta/thing/in${foo}`',
            {
                quasis: ['@beta/thing/in', ''],
                expressions: ['foo'],
                packageName: '@beta/thing',
            },
        ],
        [
            '`alpha/${foo}/component`',
            {
                quasis: ['alpha/', '/component'],
                expressions: ['foo'],
                packageName: 'alpha',
            },
        ],
        [
            '`@beta/thing/${foo}/component`',
            {
                quasis: ['@beta/thing/', '/component'],
                expressions: ['foo'],
                packageName: '@beta/thing',
            },
        ],
        [
            '`alpha/${foo}/component/${bar}`',
            {
                quasis: ['alpha/', '/component/', ''],
                expressions: ['foo', 'bar'],
                packageName: 'alpha',
            },
        ],
        [
            '`@beta/thing/${foo}/component/${bar}`',
            {
                quasis: ['@beta/thing/', '/component/', ''],
                expressions: ['foo', 'bar'],
                packageName: '@beta/thing',
            },
        ],
    ];
    for (let example of handledImportCallExamples) {
        let [arg] = example;
        test(`handled dynamic example: import(${arg})`, function (assert) {
            var _a, _b, _c, _d, _e, _f;
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), `import(${arg})`);
                yield builder.build();
                let deps = yield splitter.deps();
                assert.deepEqual([...deps.keys()], ['app', 'tests']);
                assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.staticImports, []);
                assert.deepEqual((_b = deps.get('app')) === null || _b === void 0 ? void 0 : _b.staticTemplateImports, []);
                if ('quasis' in example[1]) {
                    assert.deepEqual((_c = deps.get('app')) === null || _c === void 0 ? void 0 : _c.dynamicImports, []);
                    let dynamicTemplateImports = (_d = deps.get('app')) === null || _d === void 0 ? void 0 : _d.dynamicTemplateImports;
                    assert.equal(dynamicTemplateImports === null || dynamicTemplateImports === void 0 ? void 0 : dynamicTemplateImports.length, 1);
                    assert.deepEqual(dynamicTemplateImports === null || dynamicTemplateImports === void 0 ? void 0 : dynamicTemplateImports[0].cookedQuasis, example[1].quasis);
                    assert.deepEqual(dynamicTemplateImports === null || dynamicTemplateImports === void 0 ? void 0 : dynamicTemplateImports[0].expressionNameHints, example[1].expressions);
                    assert.equal(dynamicTemplateImports === null || dynamicTemplateImports === void 0 ? void 0 : dynamicTemplateImports[0].packageName, example[1].packageName);
                    assert.equal(dynamicTemplateImports === null || dynamicTemplateImports === void 0 ? void 0 : dynamicTemplateImports[0].packageRoot, path_1.join(project.baseDir, 'node_modules', example[1].packageName));
                }
                else {
                    assert.deepEqual((_e = deps.get('app')) === null || _e === void 0 ? void 0 : _e.dynamicTemplateImports, []);
                    let dynamicImports = (_f = deps.get('app')) === null || _f === void 0 ? void 0 : _f.dynamicImports;
                    assert.equal(dynamicImports === null || dynamicImports === void 0 ? void 0 : dynamicImports.length, 1);
                    assert.equal(dynamicImports === null || dynamicImports === void 0 ? void 0 : dynamicImports[0].specifier, example[1].specifier);
                    assert.equal(dynamicImports === null || dynamicImports === void 0 ? void 0 : dynamicImports[0].packageName, example[1].packageName);
                    assert.equal(dynamicImports === null || dynamicImports === void 0 ? void 0 : dynamicImports[0].packageRoot, path_1.join(project.baseDir, 'node_modules', example[1].packageName));
                }
            });
        });
    }
    for (let example of handledImportCallExamples) {
        let [arg] = example;
        test(`handled import example: importSync(${arg})`, function (assert) {
            var _a, _b, _c, _d, _e, _f;
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), `import { importSync } from '@embroider/macros'; importSync(${arg})`);
                yield builder.build();
                let deps = yield splitter.deps();
                assert.deepEqual([...deps.keys()], ['app', 'tests']);
                assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.dynamicImports, []);
                assert.deepEqual((_b = deps.get('app')) === null || _b === void 0 ? void 0 : _b.dynamicTemplateImports, []);
                if ('quasis' in example[1]) {
                    assert.deepEqual((_c = deps.get('app')) === null || _c === void 0 ? void 0 : _c.staticImports, []);
                    let staticTemplateImports = (_d = deps.get('app')) === null || _d === void 0 ? void 0 : _d.staticTemplateImports;
                    assert.equal(staticTemplateImports === null || staticTemplateImports === void 0 ? void 0 : staticTemplateImports.length, 1);
                    assert.deepEqual(staticTemplateImports === null || staticTemplateImports === void 0 ? void 0 : staticTemplateImports[0].cookedQuasis, example[1].quasis);
                    assert.deepEqual(staticTemplateImports === null || staticTemplateImports === void 0 ? void 0 : staticTemplateImports[0].expressionNameHints, example[1].expressions);
                    assert.equal(staticTemplateImports === null || staticTemplateImports === void 0 ? void 0 : staticTemplateImports[0].packageName, example[1].packageName);
                    assert.equal(staticTemplateImports === null || staticTemplateImports === void 0 ? void 0 : staticTemplateImports[0].packageRoot, path_1.join(project.baseDir, 'node_modules', example[1].packageName));
                }
                else {
                    assert.deepEqual((_e = deps.get('app')) === null || _e === void 0 ? void 0 : _e.staticTemplateImports, []);
                    let staticImports = (_f = deps.get('app')) === null || _f === void 0 ? void 0 : _f.staticImports;
                    assert.equal(staticImports === null || staticImports === void 0 ? void 0 : staticImports.length, 1);
                    assert.equal(staticImports === null || staticImports === void 0 ? void 0 : staticImports[0].specifier, example[1].specifier);
                    assert.equal(staticImports === null || staticImports === void 0 ? void 0 : staticImports[0].packageName, example[1].packageName);
                    assert.equal(staticImports === null || staticImports === void 0 ? void 0 : staticImports[0].packageRoot, path_1.join(project.baseDir, 'node_modules', example[1].packageName));
                }
            });
        });
    }
    let safeURLExamples = [
        "import('http://example.com/')",
        "import('https://example.com/')",
        "import('https://example.com/thing')",
        "import('//example.com/thing')",
        'import(`http://${which}`)',
        'import(`https://${which}`)',
        'import(`//${which}`)',
        'import(`http://${which}/rest`)',
        'import(`https://${which}/rest`)',
        'import(`//${which}/rest`)',
        'import(`data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=`)',
        'import(`data:application/javascript;base64,${code}`)',
    ];
    for (let src of safeURLExamples) {
        test(`safe url example: ${src}`, function (assert) {
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
                yield builder.build();
                let deps = yield splitter.deps();
                assert.deepEqual([...deps.keys()], ['app', 'tests']);
                assert.deepEqual(deps.get('app'), {
                    staticImports: [],
                    staticTemplateImports: [],
                    dynamicImports: [],
                    dynamicTemplateImports: [],
                });
            });
        });
    }
    test('disallowed patttern: partial package', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = 'import(`lo${dash}`)';
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
            }
        });
    });
    test('disallowed patttern: partial namespaced package', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = 'import(`@foo/${dash}`)';
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
            }
        });
    });
    test('dynamic relative imports are forbidden', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = "import('./thing')";
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, `ember-auto-import does not support dynamic relative imports. "./thing" is relative. To make this work, you need to upgrade to Embroider.`);
            }
        });
    });
    test('exact alias remaps package name and root', function (assert) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            setup({
                alias: {
                    'my-aliased-package$': 'aliasing-example/dist/index.js',
                },
            });
            let src = `import x from 'my-aliased-package';`;
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            let deps = yield splitter.deps();
            assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.staticImports.map((i) => ({
                packageName: i.packageName,
                packageRoot: i.packageRoot,
                specifier: i.specifier,
            })), [
                {
                    packageName: 'aliasing-example',
                    packageRoot: path_1.join(project.baseDir, 'node_modules', 'aliasing-example'),
                    specifier: 'my-aliased-package',
                },
            ]);
        });
    });
    test('prefix alias remaps package name and root', function (assert) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            setup({
                alias: {
                    'my-aliased-package': 'aliasing-example/dist',
                },
            });
            let src = `import x from 'my-aliased-package/inside';`;
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            let deps = yield splitter.deps();
            assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.staticImports.map((i) => ({
                packageName: i.packageName,
                packageRoot: i.packageRoot,
                specifier: i.specifier,
            })), [
                {
                    packageName: 'aliasing-example',
                    packageRoot: path_1.join(project.baseDir, 'node_modules', 'aliasing-example'),
                    specifier: 'my-aliased-package/inside',
                },
            ]);
        });
    });
    test('aliasing within same package leaves packageRoot and packageName unchanged', function (assert) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            setup({
                alias: {
                    'aliasing-example': 'aliasing-example/dist',
                },
            });
            let src = `import x from 'aliasing-example';`;
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            let deps = yield splitter.deps();
            assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.staticImports.map((i) => ({
                packageName: i.packageName,
                packageRoot: i.packageRoot,
                specifier: i.specifier,
            })), [
                {
                    packageName: 'aliasing-example',
                    packageRoot: path_1.join(project.baseDir, 'node_modules', 'aliasing-example'),
                    specifier: 'aliasing-example',
                },
            ]);
        });
    });
});
function stubAddonInstance(baseDir, autoImport) {
    let project = {
        root: baseDir,
        targets: {},
        ui: {},
        pkg: require(path_1.join(baseDir, 'package.json')),
        addons: [
            {
                name: 'ember-cli-babel',
                pkg: { version: '7.0.0' },
                buildBabelOptions() {
                    return {
                        plugins: [require.resolve('../../babel-plugin')],
                    };
                },
            },
        ],
        name() {
            return 'my-project';
        },
        configPath() {
            return path_1.join(baseDir, 'config', 'environment');
        },
    };
    let app = {
        env: 'development',
        project,
        options: {
            autoImport,
        },
        addonPostprocessTree: {},
    };
    return {
        name: 'ember-auto-import',
        parent: project,
        project,
        app,
        pkg: { name: 'ember-auto-import', version: '0.0.0' },
        root: '/fake',
        options: {},
        addons: [],
        treeGenerator() {
            throw new Error('unimplemnented');
        },
        _super: undefined,
        _findHost() {
            throw new Error('unimplemented');
        },
    };
}
//# sourceMappingURL=splitter-test.js.map