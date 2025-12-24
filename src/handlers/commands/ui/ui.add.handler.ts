import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const add: SubHandlerFunction<"ui", "add"> = async ({ result }) => {
  return ok({
    data: null,
    meta: { on: "ui:add", key: "add" },
    message: "UI command executed",
  })
}
