import { ensureProjectConfig } from "@/modules/init"
import { resolveAbsolute } from "@/platform/fs/bun"
import { resetIntroState } from "@/terminal/prompts/intro"
import { ParserError } from "@hulla/args"
import { dirname, join } from "node:path"
import packageJson from "../../package.json"
import {
  configureContextRuntime,
  createCommandContext,
  terminal,
} from "./context"
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

  if (parserResult.arguments.help?.detected) {
    terminal.outro("Help output is not implemented yet.")
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

  try {
    console.log("")

    const parserResult = cli.parse(argv) as unknown as ParserResult
    configureContextRuntime(parserResult)
    terminal.intro(
      `${terminal.format.package()} ${terminal.format.highlight("[")}v${packageJson.version}${terminal.format.highlight("]")} ${terminal.format.secondary(
        `[${parserResult.argv.join(" ")}]`
      )}`
    )

    const globalExitCode = await runGlobalArguments(parserResult)
    if (globalExitCode !== null) {
      return { exitCode: globalExitCode }
    }

    const detectedCommand = findDetectedCommand(parserResult)
    const mode = resolveInvocationMode(detectedCommand)

    if (mode !== "command" || !detectedCommand) {
      terminal.outro("No command selected.")
      return { exitCode: 0 }
    }

    const config = detectedCommand.requiresProjectConfig
      ? await ensureProjectConfig(
          parserResult.arguments.config?.value as string
        )
      : createPlaceholderConfig(parserResult.arguments.config?.value)
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

    terminal.log.error(
      `${terminal.format.package("error")} Unfortunately we encountered the following error:`
    )
    if (error instanceof ParserError) {
      terminal.log.error(error.message)
    } else {
      terminal.log.error((error as Error).message)
    }
    terminal.outro(
      `If you think this is a bug, please let me know on ${terminal.format.path("https://github.com/hulladev/cli/issues")}`
    )
    return { exitCode: 1 }
  } finally {
    resetIntroState()
    restoreRuntime()
  }
}

export async function main(argv = process.argv): Promise<void> {
  const { exitCode } = await runCli({ argv })
  process.exit(exitCode)
}
