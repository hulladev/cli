import type { ConfirmOptions } from "@clack/prompts"
import { confirm as cConfirm } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type ConfirmPrompt = ConfirmOptions & ExtendedPrompt

export async function confirm(params: ConfirmPrompt) {
  if (isPromptNonInteractive()) {
    return true
  }

  return cConfirm(params).then(handleCancel)
}
