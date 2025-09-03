import type { log } from "@/prompts/log"
import { Err, Ok } from "@hulla/control"

export type HandlerOutput =
  | Ok<{
      type: "success" | "error"
      message: string
      fn: keyof typeof log
    }>
  | Err<Error>
