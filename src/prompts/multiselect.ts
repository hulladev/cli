import type { MultiSelectOptions } from "@clack/prompts"
import { multiselect as cMultiselect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type MultiselectOptions<T> = MultiSelectOptions<T> & ExtendedPrompt

export async function multiselect<const T>(params: MultiselectOptions<T>) {
  return cMultiselect<T>(params).then(handleCancel)
}
