import type { Command } from "@/cli"
import { getPackageJson } from "@/lib/shared/getPackageFiles"
import type { HullaConfig } from "@/types.private"
import { err, ok } from "@hulla/control"
import { existsSync } from "fs"
import type { HandlerOutput } from "../types.handler"

export async function install(
  c: Command<"install">,
  config: HullaConfig
): Promise<HandlerOutput> {
  console.log(config)
  const dir = c.arguments.path?.value ?? process.cwd()
  try {
    if (!existsSync(dir)) {
      return ok({
        type: "error",
        message: "Directory does not exist",
        fn: "error",
      })
    }
    let packageJson = await getPackageJson(dir, "package.json")
    if (!packageJson) {
      packageJson = await getPackageJson(dir, "deno.json")
    }
    console.debug(packageJson)
    return ok({
      type: "success",
      message: "Directory exists",
      fn: "success",
    })
  } catch (e) {
    return err(e as Error)
  }
}
