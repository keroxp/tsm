#!/usr/bin/env ts-node
import * as ts from "typescript";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";
import * as prog from "caporal";
import { ensureDir, writeFile } from "fs-extra";
import { promisify } from "util";
const globAsync = promisify(glob).bind(glob);

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
      (importDecl.moduleSpecifier as any).text = `https://dev.jspm.io/${module}`;
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

prog
  .version("0.1.0")
  .argument("[files...]", "glob pattern to transpile")
  .option("--watch", "watch")
  .option("--outDir <outDir>", "output directory")
  .action(action);

async function action(
  args: {files: string[]},
  {outDir = "", watch = false}: { outDir: string; watch: boolean }
) {
  console.log(args, {outDir, watch});
  for (const arg of args.files) {
    const files = await globAsync(arg);
    const compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext
    };
    for (const file of files) {
      const text = fs.readFileSync(file).toString();
      const source = ts.createSourceFile("", text, ts.ScriptTarget.ESNext);
      const result = ts.transform(source, [swapImport]);
      result.dispose();
      const outFile = file.replace(/\.tsx?$/, ".js");
      let dist = path.join(outDir, outFile);
      const distDir = path.dirname(dist);
      console.log(dist);
      await ensureDir(distDir);
      const printer = ts.createPrinter();
      for (const t of result.transformed) {
        const i = printer.printFile(t as ts.SourceFile);
        const o = ts.transpile(i, compilerOptions);
        await writeFile(dist, o);
      }
    }
  }
}
prog.parse(process.argv);
