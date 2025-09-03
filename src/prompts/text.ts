import { text as cText, TextOptions } from "@clack/prompts"
import { ExtendedPrompt } from "./types.prompts"
import { handleCancel } from "./cancel"

type TextPrompt = TextOptions & ExtendedPrompt

export async function text(params: TextPrompt) {
  return cText(params).then(handleCancel)
}
