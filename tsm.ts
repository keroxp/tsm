import * as ts from "typescript";
import * as glob from "glob";
import * as path from "path";
import * as fs from "fs";
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
    return module.startsWith("./") || module.startsWith("/");
  }
  return ts.visitNode(rootNode, visit);
};

const args = process.argv.slice(2);
for (const a of args) {
  glob(a, null, (e, files) => {
    const compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext
    };
    for (const file of files) {
      const text = fs.readFileSync(file).toString();
      const source = ts.createSourceFile("", text , ts.ScriptTarget.ESNext);
      const result = ts.transform(source, [swapImport]);
      const dist = file.replace(/\.ts$/, ".js");
      result.dispose();
      const printer = ts.createPrinter();
      for (const t of result.transformed) {
        const i = printer.printFile(t as ts.SourceFile);
        const o = ts.transpile(i, compilerOptions);
        ts.sys.writeFile(dist, o);
      }
    }
  })
}