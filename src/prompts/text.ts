import type { TextOptions } from "@clack/prompts"
import { text as cText } from "@clack/prompts"
import { handleCancel } from "./cancel"
import type { ExtendedPrompt } from "./types.prompts"

type TextPrompt = TextOptions & ExtendedPrompt

export async function text(params: TextPrompt) {
  return cText(params).then(handleCancel)
}
