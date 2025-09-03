import { confirm as cConfirm, ConfirmOptions } from "@clack/prompts"
import { ExtendedPrompt } from "./types.prompts"
import { handleCancel } from "./cancel"

type ConfirmPrompt = ConfirmOptions & ExtendedPrompt

export async function confirm(params: ConfirmPrompt) {
  return cConfirm(params).then(handleCancel)
}
