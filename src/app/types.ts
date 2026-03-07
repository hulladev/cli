import type { d } from "@/terminal/format"
import type { intro } from "@/terminal/prompts/intro"
import type { log } from "@/terminal/prompts/log"
import type { outro } from "@/terminal/prompts/outro"
import type { Err, Ok } from "@hulla/control"
import type { ConfigSchema } from "schemas/hulla.schema"
import type { z } from "zod"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export type RawHullaConfig = z.input<typeof ConfigSchema>

export type HullaConfig = z.output<typeof ConfigSchema> & {
  path: string
  rawConfig: RawHullaConfig
}

export type ParserNode = {
  detected?: boolean
  value?: unknown
  arguments: Record<string, ParserNode>
  commands: Record<string, ParserNode>
  [key: string]: unknown
}

export type ParserResult = {
  argv: string[]
  arguments: Record<string, ParserNode>
  commands: Record<string, ParserNode>
}

export type TerminalApi = {
  format: typeof d
  intro: typeof intro
  log: typeof log
  outro: typeof outro
}

export type CommandContext = {
  argv: string[]
  parserResult: ParserResult
  config: HullaConfig
  rawConfig: RawHullaConfig
  terminal: TerminalApi
}

export type CommandSuccess<T = unknown> = {
  data: T
  message: string
}

export type CommandOutcome<T = unknown, E = Error> =
  | Ok<CommandSuccess<T>>
  | Err<E>

export type CommandModule<TDefinition = unknown, TData = unknown> = {
  name: string
  definition: TDefinition
  run: (input: {
    context: CommandContext
    result: ParserNode
  }) => Promise<CommandOutcome<TData>>
}

export type SubcommandModule<TDefinition = unknown, TData = unknown> = {
  name: string
  definition: TDefinition
  run: (input: {
    context: CommandContext
    result: ParserNode
  }) => Promise<CommandOutcome<TData>>
}
