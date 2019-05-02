#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try {
            step(generator.next(value));
        }
        catch (e) {
            reject(e);
        } }
        function rejected(value) { try {
            step(generator["throw"](value));
        }
        catch (e) {
            reject(e);
        } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as ts from "https://dev.jspm.io/typescript@3.4.5";
import * as glob from "https://dev.jspm.io/glob@7.1.3";
import * as path from "https://dev.jspm.io/path";
import * as fs from "https://dev.jspm.io/fs";
import * as prog from "https://dev.jspm.io/caporal@1.1.0";
import * as chokidar from "https://dev.jspm.io/chokidar@2.1.5";
import { ensureDir, readFile, writeFile } from "https://dev.jspm.io/fs-extra@7.0.1";
import { promisify } from "https://dev.jspm.io/util";
import * as Debug from "https://dev.jspm.io/debug@4.1.1";
import * as process from "https://dev.jspm.io/process";
const logger = Debug("tsm:");
const globAsync = promisify(glob).bind(glob);
prog
    .name("tsm")
    .version("0.1.0")
    .argument("[files...]", "glob pattern to transpile")
    .option("--watch", "watch")
    .option("--outDir <outDir>", "output directory")
    .option("--tsconfig <tsconfig>", "tsconfig.json path")
    .option("--lockFile <lockFile>", "package-lock.json")
    .action(action);
function createTransformers(getVersion) {
    const swapImport = (context) => (rootNode) => {
        function visit(node) {
            node = ts.visitEachChild(node, visit, context);
            if (!ts.isImportDeclaration(node)) {
                return node;
            }
            const importDecl = node;
            const module = importDecl.moduleSpecifier.text;
            if (isRelativePath(module)) {
                importDecl.moduleSpecifier.text = module + ".js";
                return node;
            }
            else {
                let version = getVersion(module);
                if (version) {
                    version = "@" + convertSemver(version);
                }
                else {
                    version = "";
                }
                importDecl.moduleSpecifier.text = `https://dev.jspm.io/${module}${version}`;
                return node;
            }
        }
        function isRelativePath(module) {
            return (module.startsWith("./") ||
                module.startsWith("../") ||
                module.startsWith("/"));
        }
        return ts.visitNode(rootNode, visit);
    };
    return [swapImport];
}
export function createVersionProvider(lockFile = "package-lock.json") {
    if (fs.existsSync(lockFile)) {
        const lock = fs.readFileSync(lockFile).toString();
        const json = JSON.parse(lock);
        return (module) => {
            const m = json.dependencies[module];
            if (m) {
                return m.version;
            }
        };
    }
    else if (fs.existsSync("package.json")) {
        const pkg = fs.readFileSync("package.json").toString();
        const json = JSON.parse(pkg);
        return (module) => {
            return (json.dependencies[module] ||
                json.devDependencies[module]);
        };
    }
    return _ => "";
}
function convertSemver(semver) {
    if (semver.startsWith("~")) {
        const m = semver.match(/^~(\d+)\.(\d+)/);
        if (m) {
            return `${m[1]}.${m[2]}`;
        }
    }
    else if (semver.startsWith("^")) {
        const m = semver.match(/\^(\d+)/);
        if (m) {
            return `${m[1]}`;
        }
    }
    else if (semver.startsWith("*")) {
        return "";
    }
    return semver;
}
export function doWatch(opts) {
    for (const pat of opts.files) {
        console.log(`watching ${pat}...`);
        const watcher = chokidar.watch(pat);
        watcher.on("change", (file) => __awaiter(this, void 0, void 0, function* () {
            console.log(`${file} changed...`);
            yield doTranspile({
                files: [file],
                outDir: opts.outDir,
                compilerOptions: opts.compilerOptions,
                versionProvider: opts.versionProvider
            });
            console.log("done");
        }));
    }
}
export function createDiagnosticReporter(system, pretty) {
    const host = {
        getCurrentDirectory: () => system.getCurrentDirectory(),
        getNewLine: () => system.newLine,
        getCanonicalFileName: f => f
    };
    if (!pretty) {
        return diagnostic => system.write(ts.formatDiagnostic(diagnostic, host));
    }
    const diagnostics = new Array(1);
    return diagnostic => {
        diagnostics[0] = diagnostic;
        system.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host) + host.getNewLine());
        diagnostics[0] = undefined; // TODO: GH#18217
    };
}
const reporter = createDiagnosticReporter(ts.sys);
export function doTranspile(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const { versionProvider, files, outDir, compilerOptions } = opts;
        const transformers = createTransformers(versionProvider);
        for (const pat of files) {
            const files = yield globAsync(pat);
            for (const file of files) {
                const text = fs.readFileSync(file).toString();
                const outFile = file.replace(/\.tsx?$/, ".js");
                let dist = path.join(outDir, outFile);
                const distDir = path.dirname(dist);
                yield ensureDir(distDir);
                const o = ts.transpileModule(text, {
                    fileName: path.basename(file),
                    reportDiagnostics: true,
                    compilerOptions
                });
                if (o.diagnostics.length > 0) {
                    o.diagnostics.forEach(reporter);
                }
                const source = ts.createSourceFile("", o.outputText, compilerOptions.target);
                const t = ts.transform(source, transformers, compilerOptions);
                const printer = ts.createPrinter();
                const i = printer.printFile(t.transformed[0]);
                yield writeFile(dist, i);
            }
        }
    });
}
function obtainFilePatterns(...i) {
    for (const v of i) {
        if (v && v.length > 0) {
            return v;
        }
    }
    throw new Error("no file glob patterns specified");
}
function action(args, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        logger(args, opts);
        let config = {};
        let outDir = opts.outDir || ".";
        const tsconfig = opts.tsconfig || "tsconfig.json";
        if (fs.existsSync(tsconfig)) {
            logger(`tsconfig specified: ${tsconfig}`);
            const text = (yield readFile(tsconfig)).toString();
            const json = ts.parseConfigFileTextToJson(tsconfig, text);
            if (json.error) {
                console.error(json.error);
                process.exit(1);
            }
            config = json.config;
            console.log(config);
            if (config.compilerOptions && config.compilerOptions.outDir) {
                const dir = path.dirname(tsconfig);
                outDir = path.resolve(dir, config.compilerOptions.outDir);
            }
        }
        let files = obtainFilePatterns(args.files, config.files, config.include);
        logger(`files: ${files}, ourDir: ${outDir}`);
        let versionProvider = createVersionProvider(opts.lockFile);
        const compilerOptions = config.compilerOptions;
        compilerOptions.module = ts.ModuleKind.ES2015;
        compilerOptions.target = ts.ScriptTarget.ES2015;
        if (!compilerOptions.jsx) {
            compilerOptions.jsx = ts.JsxEmit.React;
        }
        const watch = !!opts.watch;
        if (watch) {
            doWatch({ files, outDir, compilerOptions, versionProvider });
        }
        else {
            doTranspile({ files, outDir, compilerOptions, versionProvider });
        }
    });
}
if (require.main) {
    prog.parse(process.argv);
}
