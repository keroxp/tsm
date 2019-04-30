#!/usr/bin/env node
import * as ts from "typescript";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";
import * as prog from "caporal";
import * as chokidar from "chokidar";
import { ensureDir, writeFile } from "fs-extra";
import { promisify } from "util";

const globAsync = promisify(glob).bind(glob);
prog
  .name("tsm")
  .version("0.1.0")
  .argument("[files...]", "glob pattern to transpile")
  .option("--watch", "watch")
  .option("--outDir <outDir>", "output directory")
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
  } else {
    const pkg = fs.readFileSync("package.json").toString();
    const json = JSON.parse(pkg);
    return (module: string) => {
      return (json.dependencies[module] ||
        json.devDependencies[module]) as string;
    };
  }
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

export type TranspileOptions = {
  files: string[];
  watch: boolean;
  outDir: string;
  lockFile: string;
};

export function doWatch(opts: TranspileOptions) {
  for (const pat of opts.files) {
    console.log(`watching ${pat}...`);
    const watcher = chokidar.watch(pat);
    watcher.on("change", async file => {
      console.log(`${file} changed...`);
      await doTranspile({
        files: [file],
        outDir: opts.outDir,
        lockFile: opts.lockFile,
        watch: false
      });
      console.log("done");
    });
  }
}

export async function doTranspile(opts: TranspileOptions) {
  const { lockFile, files, outDir } = opts;
  const versionProvider = createVersionProvider(lockFile);
  const transformers = createTransformers(versionProvider);
  for (const pat of files) {
    const files = await globAsync(pat);
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React
    };
    for (const file of files) {
      const text = fs.readFileSync(file).toString();
      const outFile = file.replace(/\.tsx?$/, ".js");
      let dist = path.join(outDir, outFile);
      const distDir = path.dirname(dist);
      await ensureDir(distDir);
      const o = ts.transpileModule(text, {
        fileName: path.basename(file),
        compilerOptions
      });
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

function action(
  { files }: { files: string[] },
  {
    outDir = "",
    watch = false,
    lockFile
  }: { outDir: string; watch: boolean; lockFile: string }
) {
  if (watch) {
    doWatch({ files, watch, lockFile, outDir });
  } else {
    doTranspile({ files, watch, lockFile, outDir });
  }
}

export default prog;

if (require.main) {
  prog.parse(process.argv);
}