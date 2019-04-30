#!/usr/bin/env node
import * as ts from "typescript";
export declare function createVersionProvider(lockFile?: string): (module: string) => string;
export declare function doWatch(opts: {
    versionProvider: (module: string) => string;
    files: string[];
    outDir: string;
    compilerOptions: ts.CompilerOptions;
}): void;
export declare function doTranspile(opts: {
    versionProvider: (module: string) => string;
    files: string[];
    outDir: string;
    compilerOptions: ts.CompilerOptions;
}): Promise<void>;
