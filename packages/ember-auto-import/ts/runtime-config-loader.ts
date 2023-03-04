import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

export default class RuntimeConfigLoader {
  get skipWebpackOnRebuild() {
    return this.configOptions.skipWebpackOnRebuild;
  }

  get skipAnalyzerOnRebuild() {
    return this.configOptions.skipAnalyzerOnRebuild;
  }

  private get configFilename() {
    return join(process.cwd(), 'config', 'ember-auto-import.json');
  }

  private get configOptions(): Record<string, boolean> {
    let options: Record<string, boolean> = {};
    if (existsSync(this.configFilename)) {
      let fileContents = readFileSync(this.configFilename, {
        encoding: 'utf8',
      });
      try {
        options = JSON.parse(fileContents);
      } catch (err) {
        console.warn(err);
      }
    }
    return options;
  }
}
