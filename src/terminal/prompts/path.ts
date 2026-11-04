import { getCliRuntime } from "@/app/runtime"
import type { PathOptions } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type PathPrompt = PathOptions & ExtendedPrompt

export async function path(params: PathPrompt) {
  if (isPromptNonInteractive()) {
    if ("initialValue" in params && typeof params.initialValue === "string") {
      const error = params.validate?.(params.initialValue)
      if (error) throw new Error(String(error))
      return params.initialValue
    }

    throw new NonInteractivePromptError({
      prompt: "path",
      reason: "path input is required.",
      hint: "Pass explicit CLI arguments to avoid interactive path prompts.",
    })
  }

  const value = handleCancel(await getCliRuntime().prompts.path(params))
  const error = params.validate?.(value)
  if (error) throw new Error(String(error))
  return value
}
