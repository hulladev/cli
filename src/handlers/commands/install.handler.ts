import { directoryExists } from "@/lib/shared/bunUtils"
import { getPackageJson } from "@/lib/shared/getPackageFiles"
import type { HandlerFunction } from "@/types"
import { err, ok } from "@hulla/control"

export const install: HandlerFunction<"commands", "install"> = async ({
  result,
}) => {
  const dir = result.arguments.config?.value ?? process.cwd()
  try {
    // Check directory existence with Bun
    if (!(await directoryExists(dir))) {
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
