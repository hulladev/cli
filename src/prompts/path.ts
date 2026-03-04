import type { PathOptions } from "@clack/prompts"
import { autocomplete } from "@clack/prompts"
import { existsSync, lstatSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type PathPrompt = PathOptions & ExtendedPrompt

export async function path(params: PathPrompt) {
  if (isPromptNonInteractive()) {
    if ("initialValue" in params && typeof params.initialValue === "string") {
      return params.initialValue
    }

    throw new NonInteractivePromptError({
      prompt: "path",
      reason: "path input is required.",
      hint: "Pass explicit CLI arguments to avoid interactive path prompts.",
    })
  }

  return autocomplete<string>({
    ...params,
    initialUserInput: params.initialValue ?? params.root ?? process.cwd(),
    maxItems: 5,
    validate: (value) => {
      if (Array.isArray(value)) {
        return undefined
      }
      if (!value) {
        return "Please select a path"
      }
      if (params.validate) {
        return params.validate(value)
      }
      return undefined
    },
    options() {
      const userInput = this.userInput
      if (userInput === "") {
        return []
      }

      try {
        const options: Array<{ value: string; label?: string; hint?: string }> =
          []

        if (params.directory) {
          const inputExists = existsSync(userInput)
          const inputIsDirectory = inputExists
            ? lstatSync(userInput).isDirectory()
            : false

          if (!inputExists || !inputIsDirectory) {
            options.push({
              value: userInput,
              label: userInput,
              hint: "create directory",
            })
          } else {
            options.push({
              value: userInput,
              label: userInput,
              hint: "use this directory",
            })
          }
        }

        const searchPath = resolveSearchPath(userInput)
        const items = readdirSync(searchPath)
          .map((item) => {
            const fullPath = join(searchPath, item)
            const stats = lstatSync(fullPath)
            return {
              path: fullPath,
              isDirectory: stats.isDirectory(),
            }
          })
          .filter(({ path, isDirectory }) => {
            if (!path.startsWith(userInput)) {
              return false
            }
            if (params.directory) {
              return isDirectory
            }
            return true
          })

        const dynamicOptions = items.map((item) => ({
          value: item.path,
        }))

        for (const dynamicOption of dynamicOptions) {
          if (options.some((option) => option.value === dynamicOption.value)) {
            continue
          }
          options.push(dynamicOption)
        }

        return options
      } catch {
        return []
      }
    },
  }).then(handleCancel)
}

function resolveSearchPath(userInput: string): string {
  if (!existsSync(userInput)) {
    return dirname(userInput)
  }

  const stats = lstatSync(userInput)
  if (stats.isDirectory()) {
    return userInput.endsWith("/") ? userInput : dirname(userInput)
  }

  return dirname(userInput)
}
