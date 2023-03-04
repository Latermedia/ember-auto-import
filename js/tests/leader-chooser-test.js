"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const qunit_1 = __importDefault(require("qunit"));
require("qunit-assertions-extra");
const leader_1 = require("../leader");
const { module: Qmodule, test } = qunit_1.default;
class FakeProject {
    constructor(pkg) {
        this.pkg = pkg;
    }
    fakeAddon(name, version = '1.0.0') {
        return new FakeAddon(name, version, this, this);
    }
}
class FakeAddon {
    constructor(name, version, parent, project) {
        this.name = name;
        this.parent = parent;
        this.project = project;
        this.pkg = { version };
    }
    fakeAddon(name, version = '1.0.0') {
        return new FakeAddon(name, version, this, this.project);
    }
}
Qmodule('leader-chooser', function () {
    test('compatible version registered first can win', function (assert) {
        let project = new FakeProject({
            name: 'sample-app',
            devDependencies: {
                'ember-auto-import': '^2.0.0',
            },
        });
        let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
        let addonInstance = project
            .fakeAddon('intermediate')
            .fakeAddon('ember-auto-import', '2.0.1');
        leader_1.LeaderChooser.for(appInstance).register(appInstance, () => 'app won');
        leader_1.LeaderChooser.for(addonInstance).register(addonInstance, () => 'addon won');
        assert.equal(leader_1.LeaderChooser.for(appInstance).leader, 'addon won');
    });
    test('compatible version registered second can win', function (assert) {
        let project = new FakeProject({
            name: 'sample-app',
            devDependencies: {
                'ember-auto-import': '^2.0.0',
            },
        });
        let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
        let addonInstance = project
            .fakeAddon('intermediate')
            .fakeAddon('ember-auto-import', '2.0.1');
        leader_1.LeaderChooser.for(addonInstance).register(addonInstance, () => 'addon won');
        leader_1.LeaderChooser.for(appInstance).register(appInstance, () => 'app won');
        assert.equal(leader_1.LeaderChooser.for(appInstance).leader, 'addon won');
    });
    test('1.x version in app is an error', function (assert) {
        let project = new FakeProject({
            name: 'sample-app',
            devDependencies: {
                'ember-auto-import': '^2.0.0',
            },
        });
        let appInstance = project.fakeAddon('ember-auto-import', '1.0.0');
        let addonInstance = project
            .fakeAddon('intermediate')
            .fakeAddon('ember-auto-import', '2.0.1');
        leader_1.LeaderChooser.for(addonInstance).register(addonInstance, () => 'addon won');
        leader_1.LeaderChooser.for(appInstance).register(appInstance, () => 'app won');
        assert.throws(() => {
            leader_1.LeaderChooser.for(appInstance).leader;
        }, /To use these addons, your app needs ember-auto-import >= 2: intermediate/);
    });
    test('1.x version in addon is ignored', function (assert) {
        let project = new FakeProject({
            name: 'sample-app',
            devDependencies: {
                'ember-auto-import': '^2.0.0',
            },
        });
        let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
        let addonInstance = project
            .fakeAddon('intermediate')
            .fakeAddon('ember-auto-import', '1.10.1');
        leader_1.LeaderChooser.for(appInstance).register(appInstance, () => 'app won');
        leader_1.LeaderChooser.for(addonInstance).register(addonInstance, () => 'addon won');
        assert.equal(leader_1.LeaderChooser.for(appInstance).leader, 'app won');
    });
    test('newer non-compatible version does not win', function (assert) {
        let project = new FakeProject({
            name: 'sample-app',
            devDependencies: {
                'ember-auto-import': '2.1.x',
            },
        });
        let appInstance = project.fakeAddon('ember-auto-import', '2.1.0');
        let addonInstance = project
            .fakeAddon('intermediate')
            .fakeAddon('ember-auto-import', '2.1.4');
        let tooNewInstance = project
            .fakeAddon('intermediate2')
            .fakeAddon('ember-auto-import', '2.2.0');
        leader_1.LeaderChooser.for(appInstance).register(appInstance, () => 'app won');
        leader_1.LeaderChooser.for(addonInstance).register(addonInstance, () => 'addon won');
        leader_1.LeaderChooser.for(tooNewInstance).register(tooNewInstance, () => 'too new won');
        assert.equal(leader_1.LeaderChooser.for(appInstance).leader, 'addon won');
    });
});
//# sourceMappingURL=leader-chooser-test.js.map