import type { SubHandlerFunction } from "@/types"
import { ok } from "@hulla/control"

export const yes: SubHandlerFunction<"ui", "yes"> = async () => {
  return ok({
    data: null,
    meta: { on: "ui:yes", key: "yes" },
    message: "UI non-interactive mode enabled",
  })
}
