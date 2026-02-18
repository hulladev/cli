import { getTsConfigPath } from "@/lib/shared/getTsConfigPath"
import { log } from "@/prompts/log"
import { select } from "@/prompts/select"
import { text } from "@/prompts/text"
import z from "zod"

export async function createUiTsconfigTask(): Promise<string> {
  const tsConfigPaths = await getTsConfigPath(process.cwd())
  let tsConfigPath = await select<string>({
    message: "Select the tsconfig.json path",
    options: [
      {
        label: tsConfigPaths[0],
        hint: "Recommended",
        value: tsConfigPaths[0],
      },
      ...tsConfigPaths
        .slice(1)
        .filter((path) => !path.includes("node_modules"))
        .map((path) => ({
          label: path,
          value: path,
        })),
      {
        label: "Custom path",
        value: "custom",
        hint: "Enter a custom tsconfig.json path",
      },
    ],
    initialValue: tsConfigPaths[0],
  })
  if (tsConfigPath === "custom") {
    const requestTsConfigPath = async (): Promise<string> => {
      const input = await text({
        message: "Enter the custom tsconfig.json path",
        placeholder: "Enter a value",
        validate: (value) => {
          const result = z.string().min(1).endsWith(".json").safeParse(value)
          return result.error?.message
        },
      })

      if (!input) {
        return requestTsConfigPath()
      }

      const file = Bun.file(input)
      if (!(await file.exists())) {
        log.error(`File ${input} does not exist`)
        return requestTsConfigPath()
      }

      return input
    }
    tsConfigPath = await requestTsConfigPath()
  }
  return tsConfigPath
}
