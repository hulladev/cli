import type { Err, Ok } from "@hulla/control"
import type { HullaConfigSchema } from "schemas/hulla.types"
import type { cli } from "./cli"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"
export type HullaConfig = HullaConfigSchema & {
  path: string
}

export type ParserResult = ReturnType<typeof cli.parse>

type ParserCategory = Extract<keyof ParserResult, "arguments" | "commands">

export type SwitchMap<On extends ParserCategory> = {
  [K in keyof ParserResult[On]]: (data: {
    result: ParserResult[On][K]
    parserResult: ParserResult
    config: HullaConfig
  }) => unknown
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
}) => HandlerOutput<On, K, R> | Promise<HandlerOutput<On, K, R>>
