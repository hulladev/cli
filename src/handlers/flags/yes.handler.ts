import type { HandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const yes: HandlerFunction<"arguments", "yes"> = async () => {
  return ok({
    data: null,
    meta: { on: "arguments", key: "yes" },
    message: "Non-interactive mode enabled",
  })
}
