import type { Err, Ok } from "@hulla/control"
import type { ConfigSchema, HullaConfigSchema } from "schemas/hulla.schema"
import type { z } from "zod"
import type { cli } from "./cli"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"
export type RawHullaConfig = z.input<typeof ConfigSchema>
export type HullaConfig = HullaConfigSchema & {
  path: string
  rawConfig: RawHullaConfig
}

export type ParserResult = ReturnType<typeof cli.parse>

type ParserCategory = Extract<keyof ParserResult, "arguments" | "commands">

// Required switch map - all keys must be present
export type SwitchMap<On extends ParserCategory> = {
  [K in keyof ParserResult[On]]: HandlerFunction<On, K>
}

export type HandlerOutput<
  On extends ParserCategory,
  K extends keyof ParserResult[On],
  T = unknown,
  E = Error,
> =
  | Ok<{
      data: T
      meta: { on: On; key: K }
      message: string
    }>
  | Err<E>

export type HandlerFunction<
  On extends ParserCategory,
  K extends keyof ParserResult[On],
  R = unknown,
> = (data: {
  result: ParserResult[On][K]
  parserResult: ParserResult
  config: HullaConfig
  rawConfig: RawHullaConfig
}) => HandlerOutput<On, K, R> | Promise<HandlerOutput<On, K, R>>

type SubCommandKeys<ParentCommand extends keyof ParserResult["commands"]> =
  ParserResult["commands"][ParentCommand] extends {
    commands?: infer SubCommands
    arguments?: infer SubArguments
  }
    ?
        | (SubCommands extends Record<string, unknown>
            ? keyof SubCommands
            : never)
        | (SubArguments extends Record<string, unknown>
            ? keyof SubArguments
            : never)
    : never

export type SubHandlerOutput<
  ParentCommand extends keyof ParserResult["commands"],
  SubCommand extends SubCommandKeys<ParentCommand>,
  T = unknown,
  E = Error,
> =
  | Ok<{
      data: T
      meta: {
        on: `${string & ParentCommand}:${string & SubCommand}`
        key: SubCommand
      }
      message: string
    }>
  | Err<E>

export type SubHandlerFunction<
  ParentCommand extends keyof ParserResult["commands"],
  SubCommand extends SubCommandKeys<ParentCommand>,
  R = unknown,
> = (data: {
  result: ParserResult["commands"][ParentCommand] extends {
    commands?: infer SubCommands
    arguments?: infer SubArguments
  }
    ? SubCommand extends keyof SubCommands
      ? SubCommands[SubCommand]
      : SubCommand extends keyof SubArguments
        ? SubArguments[SubCommand]
        : never
    : never
  parserResult: ParserResult
  config: HullaConfig
  rawConfig: RawHullaConfig
}) =>
  | SubHandlerOutput<ParentCommand, SubCommand, R>
  | Promise<SubHandlerOutput<ParentCommand, SubCommand, R>>

export type UIInitTaskState = {
  tsConfigPath: string | null
  dependencies: string[]
  devDependencies: string[]
}
