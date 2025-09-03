import type { SelectOptions } from "@clack/prompts"
import { select as cSelect } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type SelectPrompt<T> = SelectOptions<T> & ExtendedPrompt

export async function select<const T>(params: SelectPrompt<T>) {
  return cSelect(params).then(handleCancel)
}
