import { commandErr, commandOkMessage } from "@/app/result"
import type { CommandModule, ParserResult } from "@/app/types"
import { directoryExists } from "@/platform/fs/bun"
import { getPackageJson } from "@/platform/package-json"

export async function runInstall({
  result,
}: {
  context: unknown
  result: ParserResult["commands"]["install"]
}) {
  const dir =
    typeof result.arguments.config?.value === "string"
      ? result.arguments.config.value
      : process.cwd()

  try {
    if (!(await directoryExists(dir))) {
      return commandErr(new Error("Directory does not exist"))
    }

    let packageJson = await getPackageJson(dir, "package.json")
    if (!packageJson) {
      packageJson = await getPackageJson(dir, "deno.json")
    }

    return commandOkMessage("Directory exists")
  } catch (error) {
    return commandErr(error as Error)
  }
}

export const installRunner: CommandModule["run"] = runInstall
