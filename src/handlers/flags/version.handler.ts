import type { HandlerFunction } from "@/types"
import { ok } from "@hulla/control"
import packageJson from "../../../package.json"

export const version: HandlerFunction<"arguments", "version"> = () => {
  const versionString = `hulla v${packageJson.version}`
  return ok({
    data: versionString,
    meta: { on: "arguments", key: "version" },
    message: versionString,
  })
}
