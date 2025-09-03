import type { ConfirmOptions } from "@clack/prompts"
import { confirm as cConfirm } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type ConfirmPrompt = ConfirmOptions & ExtendedPrompt

export async function confirm(params: ConfirmPrompt) {
  return cConfirm(params).then(handleCancel)
}
