import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const init: SubHandlerFunction<"ui", "init"> = async ({ result }) => {
  console.log("result ===", result)

  return ok({
    data: null,
    meta: { on: "ui:init", key: "init" },
    message: "UI command executed",
  })
}
