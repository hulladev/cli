#!/usr/bin/env node
import { cli } from "@/cli"
import { init, initHullaProject } from "@/handlers/commands/init.handler"
import { install } from "@/handlers/commands/install.handler"
import { help } from "@/handlers/flags/help.handler"
import { version } from "@/handlers/flags/version.handler"
import { executeHandlers } from "@/lib/shared/executeHandlers"
import { log } from "@/prompts/log"
import { outro } from "@/prompts/outro"
import { ParserError } from "@hulla/args"

const argv = process.argv

async function main() {
  try {
    console.log("") // empty line to give some space to std output
    const stdin = cli.parse(argv)
    const cfg = await initHullaProject(
      stdin.arguments.path?.value ?? process.cwd()
    )
    if (cfg.isErr()) {
      throw new Error(cfg.error.message)
    }
    // For future maintainers, how this works:
    // 1. Open parser/cli.ts and add any new arguments / commands
    // 2. Define a handler for the new argument / command in hnd import it here
    // 3. executeSwitch is just a fancy switch statement that compares the detected keys based on a condition of
    //    the detected keys and executes the handler for the detected key
    // 4. Each handler returns a handler output which we then process here
    const args = await executeHandlers(stdin.arguments, cfg.value, {
      help,
      version,
      path: () => null, // handled above in initHullaProject,
    })
    const commands = await executeHandlers(stdin.commands, cfg.value, {
      install,
      init,
    })
    outro("good")
    process.exit(0)
  } catch (error) {
    log.error("Unfortunately we encountered the following error:")
    if (error instanceof ParserError) {
      log.error(error.message)
    } else {
      log.error((error as Error).message)
    }
    outro("outro")
    process.exit(1)
  }
}

main().catch(console.error)
