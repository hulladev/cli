import type { HandlerFunction } from "@/types.private"
import { ok } from "@hulla/control"

export const config: HandlerFunction<"arguments", "config"> = () => {
  return ok({
    data: null,
    meta: { on: "arguments", key: "config" },
    message: "Config option",
  })
}
