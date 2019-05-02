#!/usr/bin/env node
import * as ts from "typescript";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";
import * as prog from "caporal";
import * as chokidar from "chokidar";
import { ensureDir, readFile, writeFile } from "fs-extra";
import { promisify } from "util";
import * as Debug from "debug";
import * as process from "process";
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

function createTransformers(getVersion: (module: string) => string) {
  const swapImport = <T extends ts.Node>(context: ts.TransformationContext) => (
    rootNode: T
  ) => {
    function visit(node: ts.Node): ts.Node {
      node = ts.visitEachChild(node, visit, context);
      if (!ts.isImportDeclaration(node)) {
        return node;
      }
      const importDecl: ts.ImportDeclaration = node;
      const module = (importDecl.moduleSpecifier as any).text;
      if (isRelativePath(module)) {
        (importDecl.moduleSpecifier as any).text = module + ".js";
        return node;
      } else {
        let version = getVersion(module);
        if (version) {
          version = "@" + convertSemver(version);
        } else {
          version = "";
        }
        (importDecl.moduleSpecifier as any).text = `https://dev.jspm.io/${module}${version}`;
        return node;
      }
    }

    function isRelativePath(module: string) {
      return (
        module.startsWith("./") ||
        module.startsWith("../") ||
        module.startsWith("/")
      );
    }

    return ts.visitNode(rootNode, visit);
  };
  return [swapImport];
}

export function createVersionProvider(
  lockFile: string = "package-lock.json"
): (module: string) => string {
  if (fs.existsSync(lockFile)) {
    const lock = fs.readFileSync(lockFile).toString();
    const json = JSON.parse(lock);
    return (module: string) => {
      const m = json.dependencies[module];
      if (m) {
        return m.version as string;
      }
    };
  } else if (fs.existsSync("package.json")) {
    const pkg = fs.readFileSync("package.json").toString();
    const json = JSON.parse(pkg);
    return (module: string) => {
      return (json.dependencies[module] ||
        json.devDependencies[module]) as string;
    };
  }
  return _ => "";
}

function convertSemver(semver: string) {
  if (semver.startsWith("~")) {
    const m = semver.match(/^~(\d+)\.(\d+)/);
    if (m) {
      return `${m[1]}.${m[2]}`;
    }
  } else if (semver.startsWith("^")) {
    const m = semver.match(/\^(\d+)/);
    if (m) {
      return `${m[1]}`;
    }
  } else if (semver.startsWith("*")) {
    return "";
  }
  return semver;
}

type Options = {
  watch?: boolean;
  outDir?: string;
  lockFile?: string;
  tsconfig?: string;
};
type Args = {
  files: string[];
};

export function doWatch(opts: {
  versionProvider: (module: string) => string;
  files: string[];
  outDir: string;
  compilerOptions: ts.CompilerOptions;
}) {
  for (const pat of opts.files) {
    console.log(`watching ${pat}...`);
    const watcher = chokidar.watch(pat);
    watcher.on("change", async file => {
      console.log(`${file} changed...`);
      await doTranspile({
        files: [file],
        outDir: opts.outDir,
        compilerOptions: opts.compilerOptions,
        versionProvider: opts.versionProvider
      });
      console.log("done");
    });
  }
}

type TsConfig = {
  compilerOptions?: ts.CompilerOptions;
  files?: string[];
  include?: string[];
  exclude?: string[];
  errors?: string[];
};

function createDiagnosticReporter(system: ts.System, pretty?: boolean): ts.DiagnosticReporter {
  const host: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => system.getCurrentDirectory(),
    getNewLine: () => system.newLine,
    getCanonicalFileName: f => f
  };
  if (!pretty) {
    return diagnostic => system.write(ts.formatDiagnostic(diagnostic, host));
  }

  const diagnostics: ts.Diagnostic[] = new Array(1);
  return diagnostic => {
    diagnostics[0] = diagnostic;
    system.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host) + host.getNewLine());
    diagnostics[0] = undefined!; // TODO: GH#18217
  };
}

const reporter: ts.DiagnosticReporter = createDiagnosticReporter(ts.sys);

export async function doTranspile(opts: {
  versionProvider: (module: string) => string;
  files: string[];
  outDir: string;
  compilerOptions: ts.CompilerOptions;
}) {
  const { versionProvider, files, outDir, compilerOptions } = opts;
  const transformers = createTransformers(versionProvider);
  for (const pat of files) {
    const files = await globAsync(pat);
    for (const file of files) {
      const text = fs.readFileSync(file).toString();
      const outFile = file.replace(/\.tsx?$/, ".js");
      let dist = path.join(outDir, outFile);
      const distDir = path.dirname(dist);
      await ensureDir(distDir);
      const o = ts.transpileModule(text, {
        fileName: path.basename(file),
        reportDiagnostics: true,
        compilerOptions
      });
      if (o.diagnostics.length > 0) {
        o.diagnostics.forEach(reporter);
      } else {
        const source = ts.createSourceFile(
          "",
          o.outputText,
          compilerOptions.target
        );
        const t = ts.transform(source, transformers, compilerOptions);
        const printer = ts.createPrinter();
        const i = printer.printFile(t.transformed[0] as ts.SourceFile);
        await writeFile(dist, i);
      }
    }
  }
}

function obtainFilePatterns(...i: string[][]) {
  for (const v of i) {
    if (v && v.length > 0) {
      return v;
    }
  }
  throw new Error("no file glob patterns specified");
}

async function action(args: Args, opts: Options) {
  logger(args, opts);
  let config: TsConfig = {};
  let outDir = opts.outDir || ".";
  const tsconfig = opts.tsconfig || "tsconfig.json";
  if (fs.existsSync(tsconfig)) {
    logger(`tsconfig specified: ${tsconfig}`);
    const text = (await readFile(tsconfig)).toString();
    const json = ts.parseConfigFileTextToJson(tsconfig, text);
    if (json.error) {
      console.error(json.error);
      process.exit(1);
    }
    config = json.config as TsConfig;
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
  } else {
    doTranspile({ files, outDir, compilerOptions, versionProvider });
  }
}

if (require.main) {
  prog.parse(process.argv);
}
