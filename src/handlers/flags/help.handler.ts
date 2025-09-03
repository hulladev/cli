import { Arg } from "@/cli"
import { HandlerOutput } from "../types.handler"
import { ok } from "@hulla/control"

export function help(flag: Arg<"help">): HandlerOutput {
  return ok({
    type: "success",
    message: "Help message - CLI usage information",
    fn: "info",
  })
}

