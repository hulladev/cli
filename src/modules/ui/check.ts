import { checkPackages } from "@/checks/packages"
import {
  declares,
  type CheckContext,
  type CheckResult,
  type IntegrationCheck,
} from "@/checks/types"
import { validateProjectDirectory } from "@/platform/fs/project-path"
import { existsSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import ts from "typescript"
import { readUIConfigAtPath, resolveUIConfigPath } from "./config"

function uiConfigPath(context: CheckContext): string {
  return context.config
    ? resolveUIConfigPath(context.config)
    : resolve(context.root, ".hulla/ui.json")
}

export const uiCheck: IntegrationCheck = {
  name: "ui",
  detect: (context) =>
    declares(context, "@hulla/ui") ||
    (context.config !== null &&
      context.config.configs.ui !== ".hulla/ui.json") ||
    existsSync(uiConfigPath(context)),
  async check(context) {
    const results = declares(context, "@hulla/ui")
      ? await checkPackages(context, ["@hulla/ui"], { runtime: false })
      : []
    const path = uiConfigPath(context)
    if (!existsSync(path))
      return [
        ...results,
        {
          id: "ui:config",
          status: "failure",
          message: `UI source is not configured (${path}).`,
          fix: "Run hulla ui init in this package to configure UI source.",
        },
      ]
    // The same schema loader is used by init/add; do not load any registry.
    const config = (await readUIConfigAtPath(path)).data
    if (!config.installs.length)
      return [
        ...results,
        {
          id: "ui:installs",
          status: "failure",
          message: "The UI config has no configured library installs.",
          fix: "Run hulla ui init to select a registry and framework.",
        },
      ]
    results.push({
      id: "ui:config",
      status: "pass",
      message: "UI configuration is valid.",
    })

    const required = new Set<string>()
    for (const install of config.installs) {
      const codeRoot = install.codeRoot ?? install.copyFilesRoot
      for (const [name, value] of Object.entries({
        codeRoot,
        componentsRoot: install.componentsRoot,
        copyFilesRoot: install.copyFilesRoot,
        ...Object.fromEntries(
          install.frameworks.map((framework) => [
            `output:${framework.name}`,
            framework.outputPath,
          ])
        ),
      })) {
        const error = validateProjectDirectory(value, context.root)
        if (error)
          results.push({
            id: `ui:path:${install.libraryName}:${name}`,
            status: "failure",
            message: `${install.libraryName} ${name}: ${error} (${value}).`,
            fix: "Correct the path in the UI config or rerun hulla ui init.",
          })
      }
      const fromCode = relative(
        resolve(context.root, codeRoot),
        resolve(context.root, install.componentsRoot)
      )
      if (
        fromCode === ".." ||
        fromCode.startsWith(`..${sep}`) ||
        isAbsolute(fromCode)
      )
        results.push({
          id: `ui:components:${install.libraryName}`,
          status: "failure",
          message: `${install.libraryName} componentsRoot must be inside codeRoot.`,
          fix: "Choose a component directory inside the configured code root.",
        })
      if (!install.frameworks.length)
        results.push({
          id: `ui:frameworks:${install.libraryName}`,
          status: "failure",
          message: `${install.libraryName} has no configured frameworks.`,
          fix: "Run hulla ui init and select the target framework.",
        })
      for (const framework of install.frameworks) {
        results.push(
          ...checkTsconfig(context.root, framework.tsconfigPath, codeRoot)
        )
        if (install.libraryName === "@hulla/ui") {
          required.add("@hulla/style")
          if (framework.name === "react-native") {
            for (const name of ["react", "react-native", "@hulla/style-native"])
              required.add(name)
          }
        }
      }
    }
    results.push(...(await checkPackages(context, [...required])))
    return results
  },
}

function checkTsconfig(
  root: string,
  configured: string,
  codeRoot: string
): CheckResult[] {
  const path = resolve(root, configured)
  if (!existsSync(path))
    return [
      {
        id: `ui:tsconfig:${configured}`,
        status: "failure",
        message: `Configured TypeScript file is missing: ${configured}.`,
        fix: "Restore the TypeScript config or update its path in the UI config.",
      },
    ]
  const errors: ts.Diagnostic[] = []
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (error) => errors.push(error),
    }
  )
  errors.push(
    ...(parsed?.errors ?? []).filter(
      (error) => ![18002, 18003].includes(error.code)
    )
  )
  if (errors.length || !parsed)
    return [
      {
        id: `ui:tsconfig:${configured}`,
        status: "failure",
        message: `Cannot read ${configured}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, " ")).join(" ")}`,
        fix: "Fix the TypeScript configuration and its extends references.",
      },
    ]
  const options = parsed.options as ts.CompilerOptions & {
    pathsBasePath?: string
  }
  const base = options.baseUrl ?? options.pathsBasePath ?? dirname(path)
  const targets = (options.paths?.["@/*"] ?? []).map((value) =>
    resolve(base, value.replace(/\/\*$/, ""))
  )
  const expected = resolve(root, codeRoot)
  const matches = targets.some((target) => {
    try {
      return realpathSync(target) === realpathSync(expected)
    } catch {
      return target === expected
    }
  })
  return [
    {
      id: `ui:alias:${configured}:${codeRoot}`,
      status: matches ? "pass" : "failure",
      message: matches
        ? `${configured}: @/* resolves to ${codeRoot}/*.`
        : `${configured}: @/* must resolve to the configured code root (${codeRoot}/*).`,
      ...(!matches
        ? {
            fix: "Update compilerOptions.paths, preserving the project's existing extends settings.",
          }
        : {}),
    },
  ]
}
