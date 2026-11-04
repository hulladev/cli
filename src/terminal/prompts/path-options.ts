import { hasControlCharacters } from "@/platform/fs/project-path"
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

type PathSuggestion = { value: string; hint?: string }

export function getPathSuggestions(
  input: string,
  { root, directory }: { root: string; directory?: boolean }
): PathSuggestion[] {
  if (!input || hasControlCharacters(input)) return []
  const fullInput = resolve(root, input)
  const options: PathSuggestion[] = []
  if (directory) {
    options.push({
      value: input,
      hint: existsSync(fullInput) ? "use this directory" : "create directory",
    })
  }
  // Suggestions are optional. A missing parent must never discard the typed path.
  try {
    const searchRoot = input.endsWith("/") ? fullInput : dirname(fullInput)
    for (const name of readdirSync(searchRoot)) {
      const fullPath = join(searchRoot, name)
      if (!fullPath.startsWith(fullInput)) continue
      try {
        if (directory && !statSync(fullPath).isDirectory()) continue
      } catch {
        continue
      }
      const value = isAbsolute(input)
        ? fullPath
        : relative(root, fullPath).split("\\").join("/")
      if (!options.some((item) => item.value === value)) options.push({ value })
    }
  } catch {
    // Keep the exact input selectable when suggestions cannot be read.
  }
  return options
}
