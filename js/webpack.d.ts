import type { Configuration } from 'webpack';
import { BuildResult, Bundler, BundlerOptions } from './bundler';
import type { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
export default class WebpackBundler extends Plugin implements Bundler {
    private opts;
    private state;
    private lastBuildResult;
    constructor(priorTrees: InputNode[], opts: BundlerOptions);
    get buildResult(): BuildResult;
    private get webpack();
    private get stagingDir();
    private setup;
    private setupStyleLoader;
    private skipBabel;
    private babelRule;
    private get externalsHandler();
    build(): Promise<void>;
    private summarizeStats;
    private getEarlyBootSet;
    private writeEntryFile;
    private writeLoaderFile;
    private linkDeps;
    private ensureLinked;
    private runWebpack;
}
export declare function mergeConfig(dest: Configuration, ...srcs: Configuration[]): any;
