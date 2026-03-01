import type { AutocompleteMultiSelectOptions } from "@clack/prompts"
import { autocompleteMultiselect as cAutocompleteMultiselect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type AutocompleteMultiselectPrompt<T> = AutocompleteMultiSelectOptions<T> &
  ExtendedPrompt

export async function autocompleteMultiselect<const T>(
  params: AutocompleteMultiselectPrompt<T>
) {
  if (isPromptNonInteractive()) {
    if ("initialValues" in params && Array.isArray(params.initialValues)) {
      return params.initialValues
    }

    throw new NonInteractivePromptError({
      prompt: "autocompleteMultiselect",
      reason: "component selection requires user input.",
      hint: "Pass explicit component arguments to avoid this prompt.",
    })
  }

  return cAutocompleteMultiselect<T>(params).then(handleCancel)
}
