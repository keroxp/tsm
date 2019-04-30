#!/usr/bin/env node
import * as prog from "caporal";
export declare function createVersionProvider(lockFile?: string): (module: string) => string;
export declare type TranspileOptions = {
    files: string[];
    watch: boolean;
    outDir: string;
    lockFile: string;
};
export declare function doWatch(opts: TranspileOptions): void;
export declare function doTranspile(opts: TranspileOptions): Promise<void>;
export default prog;
