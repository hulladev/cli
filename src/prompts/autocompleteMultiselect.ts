import type { AutocompleteMultiSelectOptions } from "@clack/prompts"
import { autocompleteMultiselect as cAutocompleteMultiselect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type AutocompleteMultiselectPrompt<T> = AutocompleteMultiSelectOptions<T> &
  ExtendedPrompt

export async function autocompleteMultiselect<const T>(
  params: AutocompleteMultiselectPrompt<T>
) {
  return cAutocompleteMultiselect<T>(params).then(handleCancel)
}
