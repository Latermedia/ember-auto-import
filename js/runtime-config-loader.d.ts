export default class RuntimeConfigLoader {
    get skipWebpackOnRebuild(): boolean;
    get skipAnalyzerOnRebuild(): boolean;
    private get configFilename();
    private get configOptions();
}
