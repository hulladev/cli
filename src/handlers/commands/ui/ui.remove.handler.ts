import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const remove: SubHandlerFunction<"ui", "remove"> = async ({
  result,
}) => {
  console.log("result ===", result)

  return ok({
    data: null,
    meta: { on: "ui:remove", key: "remove" },
    message: "UI command executed",
  })
}
