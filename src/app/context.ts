import { d } from "@/terminal/format"
import { intro } from "@/terminal/prompts/intro"
import { log } from "@/terminal/prompts/log"
import { outro } from "@/terminal/prompts/outro"
import { configurePromptRuntime } from "@/terminal/prompts/runtime"
import type {
  CommandContext,
  HullaConfig,
  ParserResult,
  TerminalApi,
} from "./types"

export const terminal: TerminalApi = {
  format: d,
  intro,
  log,
  outro,
}

export function configureContextRuntime(parserResult: ParserResult): void {
  configurePromptRuntime({
    nonInteractive:
      parserResult.argv.includes("--yes") || parserResult.argv.includes("-y"),
  })
}

export function createCommandContext(input: {
  argv: string[]
  parserResult: ParserResult
  config: HullaConfig
}): CommandContext {
  return {
    argv: input.argv,
    parserResult: input.parserResult,
    config: input.config,
    rawConfig: input.config.rawConfig,
    terminal,
  }
}
