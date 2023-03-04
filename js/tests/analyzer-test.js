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
const analyzer_1 = __importDefault(require("../analyzer"));
// @ts-ignore
const broccoli_babel_transpiler_1 = __importDefault(require("broccoli-babel-transpiler"));
const analyzer_syntax_1 = require("../analyzer-syntax");
const { module: Qmodule, test } = qunit_1.default;
Qmodule('analyzer', function (hooks) {
    let builder;
    let upstream;
    let analyzer;
    let pack;
    let babelConfig;
    hooks.beforeEach(function () {
        quick_temp_1.default.makeOrRemake(this, 'workDir', 'auto-import-analyzer-tests');
        fs_extra_1.ensureDirSync((upstream = path_1.join(this.workDir, 'upstream')));
        pack = {
            fileExtensions: ['js'],
        };
        babelConfig = {
            plugins: [
                require.resolve('../../js/analyzer-plugin'),
                require.resolve('@babel/plugin-syntax-typescript'),
                // keeping this in non-parallelizable form prevents
                // broccoli-babel-transpiler from spinning up separate worker processes,
                // which we don't want or need and which hang at the end of the test
                // suite.
                require('../../babel-plugin'),
            ],
        };
        let transpiled = broccoli_babel_transpiler_1.default(new broccoli_source_1.UnwatchedDir(upstream), babelConfig);
        analyzer = new analyzer_1.default(transpiled, pack, undefined, true);
        builder = new broccoli_1.default.Builder(analyzer);
    });
    hooks.afterEach(function () {
        fs_extra_1.removeSync(this.workDir);
        if (builder) {
            return builder.cleanup();
        }
    });
    test('initial file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.ok(content.endsWith(original), `${content} should end with ${original}`);
        });
    });
    test('created file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            yield builder.build();
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.ok(content.endsWith(original), `${content} should end with ${original}`);
        });
    });
    test('updated file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nimport 'other-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.ok(content.endsWith(updated), `${content} should end with ${updated}`);
        });
    });
    test('deleted file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'sample.js'));
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(path_1.join(builder.outputPath, 'sample.js')), 'should not exist');
        });
    });
    test('imports discovered in created file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            yield builder.build();
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('imports remain constant in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nconsole.log('hi');";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('import added in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nimport 'other-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
                {
                    isDynamic: false,
                    specifier: 'other-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('import removed in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "console.log('x');";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, []);
        });
    });
    test('import removed when file deleted', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'sample.js'));
            yield builder.build();
            assert.deepEqual(analyzer.imports, []);
        });
    });
    test('type-only imports ignored in created file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            yield builder.build();
            let original = `
      import type Foo from 'type-import';
      import Bar from 'value-import';

      export type { Qux } from 'type-re-export';
      export { Baz } from 'value-re-export';
    `;
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'value-import',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
                {
                    isDynamic: false,
                    specifier: 'value-re-export',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('dependency discovered from reexport', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            babelConfig.plugins.push(
            // this is here because Ember does this and we want to make sure we
            // coexist with it
            [
                require.resolve('@babel/plugin-transform-modules-amd'),
                { noInterop: true },
            ]);
            let original = "export { default } from 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('dependency discovered from namespace reexport', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "export * from 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    function isLiteralExample(exp) {
        return exp.length === 2;
    }
    let legalDynamicExamples = [
        ["import('alpha');", 'alpha'],
        ["import('@beta/thing');", '@beta/thing'],
        ['import(`gamma`);', 'gamma'],
        ['import(`@delta/thing`);', '@delta/thing'],
        ["import('epsilon/mod');", 'epsilon/mod'],
        ["import('@zeta/thing/mod');", '@zeta/thing/mod'],
        ['import(`eta/mod`);', 'eta/mod'],
        ['import(`@theta/thing/mod`);', '@theta/thing/mod'],
        ["import('http://example.com');", 'http://example.com'],
        ["import('https://example.com');", 'https://example.com'],
        ["import('//example.com');", '//example.com'],
        ['import(`http://example.com`);', 'http://example.com'],
        ['import(`https://example.com`);', 'https://example.com'],
        [
            'import(`data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=`);',
            'data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=',
        ],
        ['import(`//example.com`);', '//example.com'],
        ['import(`http://example.com`);', 'http://example.com'],
        ['import(`https://example.com`);', 'https://example.com'],
        ['import(`//example.com`);', '//example.com'],
        ['import(`http://${domain}`);', ['http://', ''], ['domain']],
        [
            'import(`https://example.com/${path}`);',
            ['https://example.com/', ''],
            ['path'],
        ],
        [
            'import(`data:application/javascript;base64,${code}`);',
            ['data:application/javascript;base64,', ''],
            ['code'],
        ],
        ['import(`//${domain}`);', ['//', ''], ['domain']],
        ['import(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
        ['import(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
        ['import(`alpha/${foo}/component`);', ['alpha/', '/component'], ['foo']],
        [
            'import(`@beta/thing/${foo}/component`);',
            ['@beta/thing/', '/component'],
            ['foo'],
        ],
        [
            'import(`alpha/${foo}/component/${bar}`);',
            ['alpha/', '/component/', ''],
            ['foo', 'bar'],
        ],
        [
            'import(`@beta/thing/${foo}/component/${bar}`);',
            ['@beta/thing/', '/component/', ''],
            ['foo', 'bar'],
        ],
    ];
    for (let example of legalDynamicExamples) {
        let [src] = example;
        test(`dynamic import example: ${src}`, function (assert) {
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), src);
                yield builder.build();
                if (isLiteralExample(example)) {
                    assert.deepEqual(analyzer.imports, [
                        {
                            isDynamic: true,
                            specifier: example[1],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
                else {
                    assert.deepEqual(analyzer.imports, [
                        {
                            isDynamic: true,
                            cookedQuasis: example[1],
                            expressionNameHints: example[2],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
            });
        });
    }
    let legalImportSyncExamples = [
        ["importSync('alpha');", 'alpha'],
        ["importSync('@beta/thing');", '@beta/thing'],
        ['importSync(`gamma`);', 'gamma'],
        ['importSync(`@delta/thing`);', '@delta/thing'],
        ["importSync('epsilon/mod');", 'epsilon/mod'],
        ["importSync('@zeta/thing/mod');", '@zeta/thing/mod'],
        ['importSync(`eta/mod`);', 'eta/mod'],
        ['importSync(`@theta/thing/mod`);', '@theta/thing/mod'],
        ['importSync(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
        ['importSync(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
        [
            'importSync(`alpha/${foo}/component`);',
            ['alpha/', '/component'],
            ['foo'],
        ],
        [
            'importSync(`@beta/thing/${foo}/component`);',
            ['@beta/thing/', '/component'],
            ['foo'],
        ],
        [
            'importSync(`alpha/${foo}/component/${bar}`);',
            ['alpha/', '/component/', ''],
            ['foo', 'bar'],
        ],
        [
            'importSync(`@beta/thing/${foo}/component/${bar}`);',
            ['@beta/thing/', '/component/', ''],
            ['foo', 'bar'],
        ],
    ];
    for (let example of legalImportSyncExamples) {
        let [src] = example;
        test(`importSync example: ${src}`, function (assert) {
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), `import { importSync } from '@embroider/macros'; ${src}`);
                yield builder.build();
                if (isLiteralExample(example)) {
                    assert.deepEqual(analyzer.imports, [
                        {
                            isDynamic: false,
                            specifier: '@embroider/macros',
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                        {
                            isDynamic: false,
                            specifier: example[1],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
                else {
                    assert.deepEqual(analyzer.imports, [
                        {
                            isDynamic: false,
                            specifier: '@embroider/macros',
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                        {
                            isDynamic: false,
                            cookedQuasis: example[1],
                            expressionNameHints: example[2],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
            });
        });
    }
    test('disallowed patttern: unsupported syntax', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = `
    function x() {
      import((function(){ return 'hi' })());
    }
    `;
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), src);
            try {
                yield builder.build();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'import() is only allowed to contain string literals or template string literals');
            }
        });
    });
});
Qmodule('analyzer-deserialize', function () {
    function sampleData() {
        return [
            {
                isDynamic: false,
                specifier: 'alpha',
            },
            {
                isDynamic: true,
                specifier: 'beta',
            },
            {
                isDynamic: false,
                cookedQuasis: ['gamma/', ''],
                expressionNameHints: [null],
            },
            {
                isDynamic: true,
                cookedQuasis: ['delta/', ''],
                expressionNameHints: ['flavor'],
            },
        ];
    }
    function source(chunks) {
        let closer;
        return {
            get chunksRemaining() {
                return chunks.length;
            },
            read() {
                if (chunks.length > 0) {
                    return chunks.shift();
                }
                else {
                    if (closer) {
                        closer();
                    }
                    return null;
                }
            },
            on(event, handler) {
                if (event === 'readable') {
                    setTimeout(handler, 0);
                }
                if (event === 'close') {
                    closer = handler;
                }
            },
            destroy() {
                if (closer) {
                    closer();
                }
            },
        };
    }
    test('no meta found', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield analyzer_syntax_1.deserialize(source(['abcdefgabcdefg']));
            assert.deepEqual(result, []);
        });
    });
    test('meta found in one chunk', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = yield analyzer_syntax_1.deserialize(source(['stuff stuff stuff ' + analyzer_syntax_1.serialize(sampleData())]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('meta spans two chunks', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let meta = analyzer_syntax_1.serialize(sampleData());
            let result = yield analyzer_syntax_1.deserialize(source([
                `stuff stuff stuff ${meta.slice(0, analyzer_syntax_1.MARKER.length + 2)}`,
                meta.slice(analyzer_syntax_1.MARKER.length + 2),
            ]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('meta spans three chunks', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let meta = analyzer_syntax_1.serialize(sampleData());
            let result = yield analyzer_syntax_1.deserialize(source([
                `stuff stuff stuff ${meta.slice(0, analyzer_syntax_1.MARKER.length + 2)}`,
                meta.slice(analyzer_syntax_1.MARKER.length + 2, analyzer_syntax_1.MARKER.length + 5),
                meta.slice(analyzer_syntax_1.MARKER.length + 5),
            ]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('leaves remaining chunks unconsumed after finding meta', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let s = source([
                `stuff stuff stuff ${analyzer_syntax_1.serialize(sampleData())} other stuff`,
                'extra',
            ]);
            let result = yield analyzer_syntax_1.deserialize(s);
            assert.deepEqual(result, sampleData());
            assert.equal(s.chunksRemaining, 1);
        });
    });
    test('start marker split between chunks', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let meta = analyzer_syntax_1.serialize(sampleData());
            let result = yield analyzer_syntax_1.deserialize(source([`stuff stuff stuff ${meta.slice(0, 2)}`, meta.slice(2)]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('false start marker at end of chunk', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let meta = analyzer_syntax_1.serialize(sampleData());
            let result = yield analyzer_syntax_1.deserialize(source([`stuff stuff stuff ${meta.slice(0, 2)}`, `other${meta}`]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('end marker split between chunks', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let meta = analyzer_syntax_1.serialize(sampleData());
            let result = yield analyzer_syntax_1.deserialize(source([`stuff stuff stuff ${meta.slice(0, -2)}`, meta.slice(-2)]));
            assert.deepEqual(result, sampleData());
        });
    });
    test('false end marker at end of chunk', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            const meta = analyzer_syntax_1.serialize(sampleData());
            assert.ok(meta.slice(analyzer_syntax_1.MARKER.length, -analyzer_syntax_1.MARKER.length).indexOf(analyzer_syntax_1.MARKER[0]) > -1, 'serialized sample data must contain first character of MARKER somewhere between boundary markers for test to have meaning');
            const slicePos = meta.slice(analyzer_syntax_1.MARKER.length, -analyzer_syntax_1.MARKER.length).indexOf(analyzer_syntax_1.MARKER[0]) +
                analyzer_syntax_1.MARKER.length +
                1;
            const result = yield analyzer_syntax_1.deserialize(source([
                `stuff stuff stuff ${meta.slice(0, slicePos)}`,
                `${meta.slice(slicePos)} stuff stuff`,
            ]));
            assert.deepEqual(result, sampleData());
        });
    });
});
//# sourceMappingURL=analyzer-test.js.map