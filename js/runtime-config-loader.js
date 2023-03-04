"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const fs_1 = require("fs");
class RuntimeConfigLoader {
    get skipWebpackOnRebuild() {
        return this.configOptions.skipWebpackOnRebuild;
    }
    get skipAnalyzerOnRebuild() {
        return this.configOptions.skipAnalyzerOnRebuild;
    }
    get configFilename() {
        return path_1.join(process.cwd(), 'config', 'ember-auto-import.json');
    }
    get configOptions() {
        let options = {};
        if (fs_1.existsSync(this.configFilename)) {
            let fileContents = fs_1.readFileSync(this.configFilename, {
                encoding: 'utf8',
            });
            try {
                options = JSON.parse(fileContents);
            }
            catch (err) {
                console.warn(err);
            }
        }
        return options;
    }
}
exports.default = RuntimeConfigLoader;
//# sourceMappingURL=runtime-config-loader.js.map