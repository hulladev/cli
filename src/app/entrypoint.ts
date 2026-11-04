import { ensureProjectConfig } from "@/modules/init"
import { getProjectRootFromConfigPath } from "@/modules/ui/config"
import { readHullaConfig } from "@/platform/config/read-hulla-config"
import { resolveAbsolute } from "@/platform/fs/bun"
import { validateProjectDirectory } from "@/platform/fs/project-path"
import { resetIntroState } from "@/terminal/prompts/intro"
import { statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import packageJson from "../../package.json"
import {
  configureContextRuntime,
  createCommandContext,
  terminal,
} from "./context"
import { getCommandHelp } from "./help"
import { detectedNodes, getStringOption } from "./options"
import { cli, commandModules } from "./registry"
import { applyCliRuntime, CliExitSignal, getCliCwd } from "./runtime"
import type {
  CommandModule,
  HullaConfig,
  ParserResult,
  RunCliInput,
  RunCliResult,
} from "./types"

type InvocationMode = "command" | "interactive-home" | "empty"

async function runGlobalArguments(
  parserResult: ParserResult
): Promise<number | null> {
  if (parserResult.arguments.version?.detected) {
    terminal.outro(`hulla v${packageJson.version}`)
    return 0
  }

  if (
    detectedNodes(parserResult).some((node) => node.arguments.help?.detected)
  ) {
    terminal.outro(getCommandHelp(parserResult))
    return 0
  }

  return null
}

function findDetectedCommand(parserResult: ParserResult): CommandModule | null {
  for (const module of commandModules) {
    const result =
      parserResult.commands[module.name as keyof ParserResult["commands"]]
    if (result?.detected) {
      return module
    }
  }
  return null
}

function resolveInvocationMode(
  detectedCommand: CommandModule | null
): InvocationMode {
  if (detectedCommand) {
    return "command"
  }

  return "empty"
}

function createPlaceholderConfig(configPath?: unknown): HullaConfig {
  const cwd = getCliCwd()
  const resolvedPath =
    typeof configPath === "string"
      ? resolveAbsolute(cwd, configPath)
      : join(cwd, ".hulla", "hulla.json")
  const projectRoot = dirname(resolvedPath)

  return {
    path: resolvedPath,
    rawConfig: {
      cli: {
        scripts: {
          add: "bun add",
          addDev: "bun add -D",
          uninstall: "bun remove",
          upgrade: "bun update",
        },
      },
      configs: {
        api: "api.config.ts",
        ui: ".hulla/ui.json",
      },
    },
    cli: {
      scripts: {
        add: "bun add",
        addDev: "bun add -D",
        uninstall: "bun remove",
        upgrade: "bun update",
      },
      cache: true,
      cacheDir: join(projectRoot, ".cache"),
      logs: true,
    },
    configs: {
      api: "api.config.ts",
      ui: ".hulla/ui.json",
    },
  }
}

export async function runCli({
  argv = process.argv,
  runtime = {},
}: RunCliInput = {}): Promise<RunCliResult> {
  const restoreRuntime = applyCliRuntime({
    ...runtime,
    nonInteractive: argv.includes("--yes") || argv.includes("-y"),
  })
  resetIntroState()
  const originalCwd = process.cwd()
  let restoreDirectoryRuntime: (() => void) | undefined

  try {
    console.log("")

    const parserResult = cli.parse(argv) as unknown as ParserResult
    configureContextRuntime(parserResult)
    terminal.intro(
      `${terminal.format.package()} ${terminal.format.highlight("[")}v${packageJson.version}${terminal.format.highlight("]")} ${terminal.format.secondary(
        `[${argv.slice(2).join(" ")}]`
      )}`
    )

    const globalExitCode = await runGlobalArguments(parserResult)
    if (globalExitCode !== null) {
      return { exitCode: globalExitCode }
    }

    const detectedCommand = findDetectedCommand(parserResult)
    const mode = resolveInvocationMode(detectedCommand)

    if (mode !== "command" || !detectedCommand) {
      terminal.outro(getCommandHelp(parserResult))
      return { exitCode: 0 }
    }

    if (
      ["ui", "api"].includes(detectedCommand.name) &&
      detectedNodes(parserResult).length === 2
    ) {
      terminal.outro(getCommandHelp(parserResult))
      return { exitCode: 0 }
    }
    if (
      detectedNodes(parserResult).some((node) => node.arguments.clean?.detected)
    ) {
      throw new Error(
        "--clean is not implemented. Omit it to configure the project without deleting files."
      )
    }
    const cwd = getStringOption(parserResult, "cwd")
    if (cwd !== undefined) {
      if (!cwd.trim()) throw new Error("--cwd requires a directory")
      const target = resolve(getCliCwd(), cwd)
      if (!statSync(target).isDirectory())
        throw new Error(`--cwd is not a directory: ${target}`)
      process.chdir(target)
      restoreDirectoryRuntime = applyCliRuntime({ cwd: target })
    }
    const requestedProjectConfig =
      getStringOption(parserResult, "project-config") ??
      (detectedCommand.name === "api"
        ? undefined
        : getStringOption(parserResult, "config"))
    const projectConfig =
      requestedProjectConfig === undefined
        ? undefined
        : resolve(getCliCwd(), requestedProjectConfig)
    // All runners receive shared options regardless of their position in argv.
    for (const node of detectedNodes(parserResult).slice(1)) {
      if (projectConfig !== undefined && detectedCommand.name !== "api") {
        node.arguments.config = {
          ...node.arguments.config,
          value: projectConfig,
          detected: true,
        } as typeof node.arguments.config
      }
      if (detectedCommand.name === "api") {
        const apiConfig = getStringOption(parserResult, "config")
        if (apiConfig !== undefined)
          node.arguments.config = {
            ...node.arguments.config,
            value: apiConfig,
            detected: true,
          } as typeof node.arguments.config
      }
    }
    if (detectedCommand.name === "ui") {
      for (const name of ["source", "framework"]) {
        const value = getStringOption(parserResult, name)
        if (value !== undefined && !value.trim())
          throw new Error(`--${name} requires a value`)
      }
      const root = getProjectRootFromConfigPath(
        createPlaceholderConfig(projectConfig).path
      )
      for (const name of ["code-root", "components-root", "copy-root"]) {
        const value = getStringOption(parserResult, name)
        if (value !== undefined) {
          const error = validateProjectDirectory(value, root)
          if (error) throw new Error(`--${name}: ${error}`)
        }
      }
    }
    const removingUI =
      detectedCommand.name === "ui" &&
      parserResult.commands.ui.commands.remove.detected
    const config = removingUI
      ? await readHullaConfig(getCliCwd(), projectConfig)
      : detectedCommand.requiresProjectConfig
        ? await ensureProjectConfig(projectConfig)
        : createPlaceholderConfig(projectConfig)
    if (!config)
      throw new Error(
        "No UI configuration found. There are no configured components to remove."
      )
    const context = createCommandContext({
      argv,
      parserResult,
      config,
    })

    const result = await detectedCommand.run({
      context,
      result: (
        parserResult.commands as Record<
          string,
          ParserResult["commands"][string]
        >
      )[detectedCommand.name] as ParserResult["commands"][string],
    })

    if (result.isErr()) {
      throw result.error
    }

    terminal.outro(
      `${terminal.format.package("success")} ${result.value.message}`
    )
    return { exitCode: 0 }
  } catch (error) {
    if (error instanceof CliExitSignal) {
      return {
        exitCode: error.exitCode,
      }
    }

    terminal.log.error(error instanceof Error ? error.message : String(error))
    terminal.outro("Run hulla --help or hulla <command> --help for usage.")
    return { exitCode: 1 }
  } finally {
    resetIntroState()
    if (restoreDirectoryRuntime) {
      process.chdir(originalCwd)
      restoreDirectoryRuntime()
    }
    restoreRuntime()
  }
}

export async function main(argv = process.argv): Promise<void> {
  const { exitCode } = await runCli({ argv })
  process.exit(exitCode)
}
