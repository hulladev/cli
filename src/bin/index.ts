#!/usr/bin/env bun
import { cli } from "@/cli"
import { d } from "@/decorators"
import { init, initHullaProject } from "@/handlers/commands/init.handler"
import { install } from "@/handlers/commands/install.handler"
import { ui } from "@/handlers/commands/ui.handler"
import { help } from "@/handlers/flags/help.handler"
import { version } from "@/handlers/flags/version.handler"
import { config } from "@/handlers/options/config.handler"
import { executeHandlers } from "@/lib/shared/executeHandlers"
import { resolve } from "@/lib/shared/resolve"
import { log } from "@/prompts/log"
import { outro } from "@/prompts/outro"
import { ParserError } from "@hulla/args"
import packageJson from "../../package.json"
import { intro } from "../prompts/intro"

const argv = process.argv

async function main() {
  try {
    console.log("") // empty line to give some space to std output
    const parserResult = cli.parse(argv)
    intro(
      `${d.package()} ${d.highlight("[")}v${packageJson.version}${d.highlight("]")} ${d.secondary(
        `[${parserResult.argv.join(" ")}]`
      )}`
    )
    const cfg = await initHullaProject(
      parserResult.arguments.config?.value ?? process.cwd()
    )
    if (cfg.isErr()) {
      throw new Error(cfg.error.message)
    }
    // For future maintainers, how this works:
    // 1. Open parser/cli.ts and add any new arguments / commands
    // 2. Define a handler for the new argument / command and import it here
    // 3. executeSwitch is just a fancy switch statement that executes the handler for the detected key
    // 4. Each handler returns a handler output which we then process here
    const args = await executeHandlers(parserResult, "arguments", cfg.value, {
      help,
      version,
      config,
    })
    const commands = await executeHandlers(
      parserResult,
      "commands",
      cfg.value,
      {
        install,
        init,
        ui,
      }
    )
    // Resolve just handles the final outro/success/error log logic
    resolve({ args, commands })
    return process.exit(0)
  } catch (error) {
    log.error(
      `${d.package("error")} Unfortunately we encountered the following error:`
    )
    if (error instanceof ParserError) {
      log.error(error.message)
    } else {
      log.error((error as Error).message)
    }
    outro(
      `If you think this is a bug, please let me know on ${d.path("https://github.com/hulladev/cli/issues")}`
    )
    process.exit(1)
  }
}

main().catch(console.error)
