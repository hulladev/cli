import type { PathOptions } from "@clack/prompts"
import { getCliRuntime } from "@/app/runtime"
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

  return getCliRuntime().prompts.path(params).then(handleCancel)
}
