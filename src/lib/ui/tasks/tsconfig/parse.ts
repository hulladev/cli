import ts from "typescript"

export type TsconfigJson = Record<string, unknown>

export function parseTsconfigText(
  text: string,
  filePath: string
): TsconfigJson {
  const parsed = ts.parseConfigFileTextToJson(filePath, text)

  if (parsed.error) {
    const message = ts.flattenDiagnosticMessageText(
      parsed.error.messageText,
      "\n"
    )
    throw new Error(`Failed to parse tsconfig at ${filePath}: ${message}`)
  }

  if (
    !parsed.config ||
    typeof parsed.config !== "object" ||
    Array.isArray(parsed.config)
  ) {
    return {}
  }

  return parsed.config as TsconfigJson
}

export async function readTsconfigFile(path: string): Promise<{
  exists: boolean
  text: string
  config: TsconfigJson
}> {
  const file = Bun.file(path)
  const exists = await file.exists()

  if (!exists) {
    return {
      exists: false,
      text: "",
      config: {},
    }
  }

  const text = await file.text()
  const config = parseTsconfigText(text, path)

  return {
    exists: true,
    text,
    config,
  }
}
