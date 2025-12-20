import { getPackageJson } from "@/lib/shared/getPackageFiles"
import type { HandlerFunction } from "@/types.private"
import { err, ok } from "@hulla/control"
import { existsSync } from "fs"

export const install: HandlerFunction<"commands", "install"> = async ({
  result,
}) => {
  const dir = result.arguments.config?.value ?? process.cwd()
  try {
    if (!existsSync(dir)) {
      return err(new Error("Directory does not exist"))
    }
    let packageJson = await getPackageJson(dir, "package.json")
    if (!packageJson) {
      packageJson = await getPackageJson(dir, "deno.json")
    }
    return ok({
      data: null,
      meta: { on: "commands", key: "install" },
      message: "Directory exists",
    })
  } catch (e) {
    return err(e as Error)
  }
}
