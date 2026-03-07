import type { MultiSelectOptions } from "@clack/prompts"
import { multiselect as cMultiselect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type MultiselectOptions<T> = MultiSelectOptions<T> & ExtendedPrompt

export async function multiselect<const T>(params: MultiselectOptions<T>) {
  if (isPromptNonInteractive()) {
    if ("initialValues" in params && Array.isArray(params.initialValues)) {
      return params.initialValues
    }

    throw new NonInteractivePromptError({
      prompt: "multiselect",
      reason: "multiple selections are required.",
      hint: "Pass explicit CLI arguments to avoid interactive multiselect prompts.",
    })
  }

  return cMultiselect<T>(params).then(handleCancel)
}
