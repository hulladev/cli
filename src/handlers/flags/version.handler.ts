import { Arg } from "@/cli"
import { HandlerOutput } from "../types.handler"
import { ok } from "@hulla/control"

export function version(flag: Arg<"version">): HandlerOutput {
  return ok({
    type: "success",
    message: "hulla v0.0.0-alpha.0",
    fn: "info",
  })
}
