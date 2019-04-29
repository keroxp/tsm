import * as ts from "typescript";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";
import * as prog from "caporal";
import { ensureDir, readFile, writeFile } from "fs-extra";
import { promisify } from "util";

const globAsync = promisify(glob).bind(glob);

prog
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
        version = version ? "@" + version : "";
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

function createVersionProvider(
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

async function action(
  args: { files: string[] },
  {
    outDir = "",
    watch = false,
    lockFile
  }: { outDir: string; watch: boolean; lockFile: string }
) {
  const versionProvider = createVersionProvider(lockFile);
  const transformers = createTransformers(versionProvider);
  for (const arg of args.files) {
    const files = await globAsync(arg);
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
        compilerOptions,
      });
      const source = ts.createSourceFile("", o.outputText, compilerOptions.target);
      const t = ts.transform(source, transformers, compilerOptions)
      const printer = ts.createPrinter();
      const i = printer.printFile(t.transformed[0] as ts.SourceFile);
      await writeFile(dist, i);
    }
  }
}

export default prog;
