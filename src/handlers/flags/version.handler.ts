import type { HandlerFunction } from "@/types.private"
import { ok } from "@hulla/control"

export const version: HandlerFunction<"arguments", "version"> = () => {
  return ok({
    data: "hulla v0.0.0-alpha.0",
    meta: { on: "arguments", key: "version" },
    message: "hulla v0.0.0-alpha.0",
  })
}
