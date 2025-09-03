import type { Arg } from "@/cli"
import type { ok } from "@hulla/control"
import type { HandlerOutput } from "../types.handler"

export function version(flag: Arg<"version">): HandlerOutput {
  return ok({
    type: "success",
    message: "hulla v0.0.0-alpha.0",
    fn: "info",
  })
}
