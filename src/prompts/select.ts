import { select as cSelect, SelectOptions } from "@clack/prompts"
import { ExtendedPrompt } from "./types.prompts"
import { handleCancel } from "./cancel"

type SelectPrompt<T> = SelectOptions<T> & ExtendedPrompt

export async function select<const T>(params: SelectPrompt<T>) {
  return cSelect(params).then(handleCancel)
}
