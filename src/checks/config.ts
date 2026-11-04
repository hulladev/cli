import ts from "typescript"
import type { CheckResult } from "./types"

export async function checkConfigSyntax(path: string): Promise<CheckResult> {
  const source = await Bun.file(path).text()
  const parsed = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  })
  const errors = (parsed.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  return errors.length
    ? {
        id: `config:syntax:${path}`,
        status: "failure",
        message: `${path}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, " ")).join(" ")}`,
        fix: "Correct the config syntax. This check does not evaluate its exports or imports.",
      }
    : {
        id: `config:syntax:${path}`,
        status: "pass",
        message: `${path} has valid syntax; its code was not evaluated.`,
      }
}
