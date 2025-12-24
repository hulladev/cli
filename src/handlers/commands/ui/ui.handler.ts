import type { HandlerFunction } from "@/types.private"
import { ok } from "@hulla/control"

export const ui: HandlerFunction<"commands", "ui"> = async ({ result }) => {
  console.log("reult", result)
  return ok({
    data: null,
    meta: { on: "commands", key: "ui" },
    message: "UI command executed",
  })
}
