import type { SelectOptions } from "@clack/prompts"
import { select as cSelect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type SelectPrompt<T> = SelectOptions<T> & ExtendedPrompt

export async function select<const T>(params: SelectPrompt<T>) {
  if (isPromptNonInteractive()) {
    if ("initialValue" in params && params.initialValue !== undefined) {
      return params.initialValue
    }

    throw new NonInteractivePromptError({
      prompt: "select",
      reason: "a selection is required.",
      hint: "Pass an explicit CLI argument to avoid interactive selection.",
    })
  }

  return cSelect(params).then(handleCancel)
}
