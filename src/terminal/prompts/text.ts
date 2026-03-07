import type { TextOptions } from "@clack/prompts"
import { text as cText } from "@clack/prompts"
import { handleCancel } from "./cancel"
import { isPromptNonInteractive, NonInteractivePromptError } from "./runtime"
import type { ExtendedPrompt } from "./types.prompts"

type TextPrompt = TextOptions & ExtendedPrompt

export async function text(params: TextPrompt) {
  if (isPromptNonInteractive()) {
    if ("initialValue" in params && typeof params.initialValue === "string") {
      return params.initialValue
    }

    throw new NonInteractivePromptError({
      prompt: "text",
      reason: "text input is required.",
      hint: "Pass explicit CLI arguments to avoid interactive text prompts.",
    })
  }

  return cText(params).then(handleCancel)
}
