type PromptRuntimeState = {
  nonInteractive: boolean
}

const state: PromptRuntimeState = {
  nonInteractive: false,
}

type ConfigurePromptRuntimeInput = {
  nonInteractive: boolean
}

type NonInteractivePromptErrorInput = {
  prompt: string
  reason: string
  hint?: string
}

export class NonInteractivePromptError extends Error {
  public readonly prompt: string

  public readonly hint?: string

  constructor({ prompt, reason, hint }: NonInteractivePromptErrorInput) {
    const suffix = hint ? ` ${hint}` : ""
    super(`Prompt required but --yes was used: ${reason}${suffix}`)
    this.name = "NonInteractivePromptError"
    this.prompt = prompt
    this.hint = hint
  }
}

export function configurePromptRuntime(
  input: ConfigurePromptRuntimeInput
): void {
  state.nonInteractive = input.nonInteractive
}

export function isPromptNonInteractive(): boolean {
  return state.nonInteractive
}
