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
const debug_1 = __importDefault(require("debug"));
const util_1 = require("./util");
const lodash_1 = require("lodash");
const path_1 = require("path");
const semver_1 = require("semver");
const debug = debug_1.default('ember-auto-import:splitter');
class Splitter {
    constructor(options) {
        this.options = options;
        this.lastDeps = null;
        this.packageVersions = new Map();
    }
    deps() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.importsChanged()) {
                this.lastDeps = yield this.computeDeps(this.options.analyzers);
                debug('output %s', new LazyPrintDeps(this.lastDeps));
            }
            return this.lastDeps;
        });
    }
    importsChanged() {
        let imports = [...this.options.analyzers.keys()].map((analyzer) => analyzer.imports);
        if (!this.lastImports || !util_1.shallowEqual(this.lastImports, imports)) {
            this.lastImports = imports;
            return true;
        }
        return false;
    }
    computeTargets(analyzers) {
        return __awaiter(this, void 0, void 0, function* () {
            let targets = new Map();
            let templateTargets = new Map();
            let imports = lodash_1.flatten([...analyzers.keys()].map((analyzer) => analyzer.imports));
            yield Promise.all(imports.map((imp) => __awaiter(this, void 0, void 0, function* () {
                if ('specifier' in imp) {
                    yield this.handleLiteralImport(imp, targets);
                }
                else {
                    yield this.handleTemplateImport(imp, templateTargets);
                }
            })));
            return { targets, templateTargets };
        });
    }
    handleLiteralImport(imp, targets) {
        return __awaiter(this, void 0, void 0, function* () {
            let target = imp.package.resolve(imp.specifier, imp.path);
            if (!target) {
                return;
            }
            if (target.type === 'url') {
                // people can statically import from URLs if they want to, that's clearly
                // nothing to do with us (though in practice the rest of ember-cli will
                // generally be sad about this)
                return;
            }
            if (target.type === 'local') {
                // we're only trying to identify imports of external NPM
                // packages, so relative imports are never relevant.
                if (imp.isDynamic) {
                    throw new Error(`ember-auto-import does not support dynamic relative imports. "${imp.specifier}" is relative. To make this work, you need to upgrade to Embroider.`);
                }
                return;
            }
            let seenAlready = targets.get(imp.specifier);
            if (seenAlready) {
                yield this.assertSafeVersion(seenAlready, imp, target);
                seenAlready.importedBy.push(imp);
            }
            else {
                targets.set(imp.specifier, {
                    specifier: imp.specifier,
                    packageName: target.packageName,
                    packageRoot: target.packageRoot,
                    importedBy: [imp],
                });
            }
        });
    }
    handleTemplateImport(imp, targets) {
        return __awaiter(this, void 0, void 0, function* () {
            let [leadingQuasi] = imp.cookedQuasis;
            let target = imp.package.resolve(leadingQuasi, imp.path, true);
            if (!target) {
                throw new Error(`ember-auto-import is unable to handle '${leadingQuasi}'. ` +
                    `The attempted import of '${imp.cookedQuasis.join('')}' is located in ${imp.path}`);
            }
            if (target.type === 'local') {
                return;
            }
            if (target.type === 'imprecise') {
                throw new Error(`Dynamic imports must target unambiguous package names. '${leadingQuasi}' is ambiguous. ` +
                    `The attempted import of '${imp.cookedQuasis.join('')}' is located in ${imp.path}`);
            }
            if (target.type === 'url') {
                return;
            }
            // this just makes the key look pleasantly like the original template
            // string, there's nothing magical about "e" here, it just means "an
            // expression goes here and we don't care which one".c
            let specifierKey = imp.cookedQuasis.join('${e}');
            let seenAlready = targets.get(specifierKey);
            if (seenAlready) {
                yield this.assertSafeVersion(seenAlready, imp, target);
                seenAlready.importedBy.push(imp);
            }
            else {
                targets.set(specifierKey, {
                    packageName: target.packageName,
                    packageRoot: target.packageRoot,
                    cookedQuasis: imp.cookedQuasis,
                    expressionNameHints: imp.expressionNameHints.map((hint, index) => hint || `arg${index}`),
                    importedBy: [imp],
                });
            }
        });
    }
    versionOfPackage(packageRoot) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.packageVersions.has(packageRoot)) {
                return this.packageVersions.get(packageRoot);
            }
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            let pkg = require(path_1.join(packageRoot, 'package.json'));
            let version = pkg.version;
            this.packageVersions.set(packageRoot, version);
            return version;
        });
    }
    assertSafeVersion(alreadyResolved, nextImport, nextTarget) {
        return __awaiter(this, void 0, void 0, function* () {
            if (alreadyResolved.packageRoot === nextTarget.packageRoot) {
                // the next import is resolving to the same copy of the package we are
                // already using. This is the normal and happy case.
                return;
            }
            let requestedRange = nextImport.package.requestedRange(nextTarget.packageName);
            if (!requestedRange) {
                // this is probably an error condition, but it's not the error condition
                // that this particular assertion is checking. Our job is just to make
                // sure nobody's requested semver ranges are violated. If you don't have
                // any range, we can't violate it. In practice if you lacked a declared
                // dependency, Package#resolve would have failed earlier than this because
                // it ensures we only resolve declared dependencies.
                return;
            }
            let haveVersion = yield this.versionOfPackage(alreadyResolved.packageRoot);
            if (!semver_1.satisfies(haveVersion, requestedRange, { includePrerelease: true })) {
                throw new Error(`${nextImport.package.name} needs ${nextTarget.packageName} satisfying ${requestedRange}, but we have version ${haveVersion} because of ${alreadyResolved.importedBy
                    .map((i) => i.package.name)
                    .join(', ')}`);
            }
        });
    }
    computeDeps(analyzers) {
        return __awaiter(this, void 0, void 0, function* () {
            let targets = yield this.computeTargets(analyzers);
            let deps = new Map();
            this.options.bundles.names.forEach((bundleName) => {
                deps.set(bundleName, {
                    staticImports: [],
                    staticTemplateImports: [],
                    dynamicImports: [],
                    dynamicTemplateImports: [],
                });
            });
            for (let target of targets.targets.values()) {
                let [dynamicUses, staticUses] = lodash_1.partition(target.importedBy, (imp) => imp.isDynamic);
                if (staticUses.length > 0) {
                    let bundleName = this.chooseBundle(staticUses);
                    deps.get(bundleName).staticImports.push(target);
                }
                if (dynamicUses.length > 0) {
                    let bundleName = this.chooseBundle(dynamicUses);
                    deps.get(bundleName).dynamicImports.push(target);
                }
            }
            for (let target of targets.templateTargets.values()) {
                let [dynamicUses, staticUses] = lodash_1.partition(target.importedBy, (imp) => imp.isDynamic);
                if (staticUses.length > 0) {
                    let bundleName = this.chooseBundle(staticUses);
                    deps.get(bundleName).staticTemplateImports.push(target);
                }
                if (dynamicUses.length > 0) {
                    let bundleName = this.chooseBundle(dynamicUses);
                    deps.get(bundleName).dynamicTemplateImports.push(target);
                }
            }
            this.sortDependencies(deps);
            return deps;
        });
    }
    sortDependencies(deps) {
        for (const bundle of deps.values()) {
            this.sortBundle(bundle);
        }
    }
    sortBundle(bundle) {
        bundle.staticImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
        bundle.dynamicImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
        bundle.dynamicTemplateImports.sort((a, b) => a.cookedQuasis[0].localeCompare(b.cookedQuasis[0]));
    }
    // given that a module is imported by the given list of paths, which
    // bundle should it go in?
    chooseBundle(importedBy) {
        let usedInBundles = {};
        importedBy.forEach((usage) => {
            usedInBundles[this.bundleFor(usage)] = true;
        });
        return this.options.bundles.names.find((bundle) => usedInBundles[bundle]);
    }
    bundleFor(usage) {
        let bundleName = usage.treeType === undefined ||
            typeof this.options.bundles.bundleForTreeType !== 'function'
            ? this.options.bundles.bundleForPath(usage.path)
            : this.options.bundles.bundleForTreeType(usage.treeType);
        if (this.options.bundles.names.indexOf(bundleName) === -1) {
            throw new Error(`bundleForPath("${usage.path}") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.names.join(',')}`);
        }
        debug('bundleForPath("%s")=%s', usage.path, bundleName);
        return bundleName;
    }
}
exports.default = Splitter;
class LazyPrintDeps {
    constructor(deps) {
        this.deps = deps;
    }
    describeResolvedImport(imp) {
        return {
            specifier: imp.specifier,
            packageRoot: imp.packageRoot,
            importedBy: imp.importedBy.map(this.describeImport.bind(this)),
        };
    }
    describeImport(imp) {
        return {
            package: imp.package.name,
            path: imp.path,
        };
    }
    describeTemplateImport(imp) {
        return {
            cookedQuasis: imp.cookedQuasis,
            expressionNameHints: imp.expressionNameHints,
            importedBy: imp.importedBy.map(this.describeImport.bind(this)),
        };
    }
    toString() {
        let output = {};
        for (let [bundle, { staticImports, dynamicImports, dynamicTemplateImports },] of this.deps.entries()) {
            output[bundle] = {
                static: staticImports.map(this.describeResolvedImport.bind(this)),
                dynamic: dynamicImports.map(this.describeResolvedImport.bind(this)),
                dynamicTemplate: dynamicTemplateImports.map(this.describeTemplateImport.bind(this)),
            };
        }
        return JSON.stringify(output, null, 2);
    }
}
//# sourceMappingURL=splitter.js.map