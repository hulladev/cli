import { Command } from "@/cli"
import { err, ok } from "@hulla/control"
import { existsSync } from "fs"
import { HandlerOutput } from "../types.handler"
import { getPackageJson } from "@/lib/getPackageFiles"
import { getHullaConfig } from "@/lib/getHullaConfig"

export async function install(c: Command<"install">): Promise<HandlerOutput> {
  const dir = c.arguments.path?.value ?? process.cwd()
  try {
    if (!existsSync(dir)) {
      return ok({
        type: "error",
        message: "Directory does not exist",
        fn: "error",
      })
    }
    const config = await getHullaConfig(dir)
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
