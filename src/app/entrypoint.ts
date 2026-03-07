import { ensureProjectConfig } from "@/modules/init"
import { ParserError } from "@hulla/args"
import packageJson from "../../package.json"
import {
  configureContextRuntime,
  createCommandContext,
  terminal,
} from "./context"
import { cli, commandModules } from "./registry"
import type { CommandModule, ParserResult } from "./types"

async function runGlobalArguments(parserResult: ParserResult): Promise<void> {
  if (parserResult.arguments.version?.detected) {
    terminal.outro(`hulla v${packageJson.version}`)
    process.exit(0)
  }

  if (parserResult.arguments.help?.detected) {
    terminal.outro("Help output is not implemented yet.")
    process.exit(0)
  }
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

export async function main(argv = process.argv): Promise<void> {
  try {
    console.log("")

    const parserResult = cli.parse(argv) as unknown as ParserResult
    configureContextRuntime(parserResult)
    terminal.intro(
      `${terminal.format.package()} ${terminal.format.highlight("[")}v${packageJson.version}${terminal.format.highlight("]")} ${terminal.format.secondary(
        `[${parserResult.argv.join(" ")}]`
      )}`
    )

    await runGlobalArguments(parserResult)

    const config = await ensureProjectConfig(
      parserResult.arguments.config?.value
    )
    const context = createCommandContext({
      argv,
      parserResult,
      config,
    })

    const detectedCommand = findDetectedCommand(parserResult)
    if (!detectedCommand) {
      terminal.outro("No command selected.")
      process.exit(0)
    }

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
    process.exit(0)
  } catch (error) {
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
    process.exit(1)
  }
}
