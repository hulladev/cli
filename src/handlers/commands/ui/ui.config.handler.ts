import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const config: SubHandlerFunction<"ui", "config"> = async ({
  result,
}) => {
  console.log("result ===", result)

  return ok({
    data: null,
    meta: { on: "ui:config", key: "config" },
    message: "UI command executed",
  })
}
