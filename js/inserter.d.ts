import type { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import BundleConfig from './bundle-config';
import { Bundler } from './bundler';
export interface InserterOptions {
    publicAssetURL: string;
    insertScriptsAt: string | undefined;
    insertStylesAt: string | undefined;
}
export declare class Inserter extends Plugin {
    private bundler;
    private config;
    private options;
    private outputCache;
    constructor(allApp: InputNode, bundler: Bundler, config: BundleConfig, options: InserterOptions);
    build(): Promise<void>;
    private cachedOutputFileSync;
    private processHTML;
    private insertScripts;
    private replaceCustomScript;
    private replaceCustomStyle;
    private scriptFromCustomElement;
    private styleFromCustomElement;
    private insertStyles;
    private chunkURL;
    private fastbootManifestInfo;
    private categorizeChunks;
}
