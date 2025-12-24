import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const help: SubHandlerFunction<"ui", "help"> = async ({ result }) => {
  console.log("result ===", result)

  return ok({
    data: null,
    meta: { on: "ui:help", key: "help" },
    message: "UI command executed",
  })
}
