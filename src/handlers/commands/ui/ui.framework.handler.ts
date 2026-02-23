import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const framework: SubHandlerFunction<"ui", "framework"> = async () => {
  return ok({
    data: null,
    meta: { on: "ui:framework", key: "framework" },
    message: "Framework option",
  })
}
