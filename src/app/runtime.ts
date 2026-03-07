import type {
  AutocompleteMultiSelectOptions,
  ConfirmOptions,
  MultiSelectOptions,
  PathOptions,
  SelectOptions,
  TextOptions,
} from "@clack/prompts"
import {
  autocomplete,
  autocompleteMultiselect as cAutocompleteMultiselect,
  box as cBox,
  cancel as cCancel,
  confirm as cConfirm,
  intro as cIntro,
  log as cLog,
  multiselect as cMultiselect,
  note as cNote,
  outro as cOutro,
  select as cSelect,
  spinner as cSpinner,
  text as cText,
} from "@clack/prompts"
import type { ExtendedPrompt } from "@/terminal/prompts/types.prompts"
import { existsSync, lstatSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"

export type SpinnerHandle = {
  start(message: string): void
  stop(message?: string): void
}

export type PromptAdapter = {
  confirm(params: ConfirmOptions & ExtendedPrompt): Promise<boolean | symbol>
  select<T>(params: SelectOptions<T> & ExtendedPrompt): Promise<T | symbol>
  text(params: TextOptions & ExtendedPrompt): Promise<string | symbol>
  path(params: PathOptions & ExtendedPrompt): Promise<string | symbol>
  multiselect<T>(
    params: MultiSelectOptions<T> & ExtendedPrompt
  ): Promise<T[] | symbol>
  autocompleteMultiselect<T>(
    params: AutocompleteMultiSelectOptions<T> & ExtendedPrompt
  ): Promise<T[] | symbol>
}

export type TerminalLogAdapter = {
  info(message: string): void | Promise<void>
  warn(message: string): void | Promise<void>
  error(message: string): void | Promise<void>
  success(message: string): void | Promise<void>
}

export type TerminalAdapter = {
  intro(message: string): void
  outro(message: string): void
  note(message: string, title?: string): void | Promise<void>
  box(message: string, title?: string): void
  cancel(message: string): void
  log: TerminalLogAdapter
  spinner(): SpinnerHandle
}

export type CliRuntime = {
  prompts: PromptAdapter
  terminal: TerminalAdapter
  cwd: () => string
}

type RuntimeState = CliRuntime & {
  nonInteractive: boolean
}

export type CliRuntimeOverrides = {
  prompts?: PromptAdapter
  terminal?: TerminalAdapter
  cwd?: string | (() => string)
  nonInteractive?: boolean
}

export class CliExitSignal extends Error {
  constructor(public readonly exitCode: number) {
    super(`CLI requested exit with code ${exitCode}`)
    this.name = "CliExitSignal"
  }
}

const defaultRuntime: CliRuntime = {
  prompts: {
    confirm: cConfirm,
    select: cSelect,
    text: cText,
    path: createProductionPathPromptAdapter(),
    multiselect: cMultiselect,
    autocompleteMultiselect: cAutocompleteMultiselect,
  },
  terminal: {
    intro: cIntro,
    outro: cOutro,
    note: cNote,
    box: cBox,
    cancel: cCancel,
    log: {
      info: cLog.info,
      warn: cLog.warn,
      error: cLog.error,
      success: cLog.success,
    },
    spinner: cSpinner,
  },
  cwd: () => process.cwd(),
}

const state: RuntimeState = {
  ...defaultRuntime,
  nonInteractive: false,
}

export function applyCliRuntime(input: CliRuntimeOverrides): () => void {
  const previous: RuntimeState = {
    prompts: state.prompts,
    terminal: state.terminal,
    cwd: state.cwd,
    nonInteractive: state.nonInteractive,
  }

  if (input.prompts) {
    state.prompts = input.prompts
  }
  if (input.terminal) {
    state.terminal = input.terminal
  }
  if (input.cwd) {
    state.cwd =
      typeof input.cwd === "string" ? () => input.cwd : input.cwd
  }
  if (typeof input.nonInteractive === "boolean") {
    state.nonInteractive = input.nonInteractive
  }

  return () => {
    state.prompts = previous.prompts
    state.terminal = previous.terminal
    state.cwd = previous.cwd
    state.nonInteractive = previous.nonInteractive
  }
}

export function getCliRuntime(): RuntimeState {
  return state
}

export function getCliCwd(): string {
  return state.cwd()
}

export function requestCliExit(exitCode: number): never {
  throw new CliExitSignal(exitCode)
}

function createProductionPathPromptAdapter(): PromptAdapter["path"] {
  return (params) =>
    autocomplete<string>({
      ...params,
      initialUserInput: params.initialValue ?? params.root ?? getCliCwd(),
      maxItems: 5,
      validate: (value) => {
        if (Array.isArray(value)) {
          return undefined
        }
        if (!value) {
          return "Please select a path"
        }
        if (params.validate) {
          return params.validate(value)
        }
        return undefined
      },
      options() {
        const userInput = this.userInput
        if (userInput === "") {
          return []
        }

        try {
          const options: Array<{
            value: string
            label?: string
            hint?: string
          }> = []

          if (params.directory) {
            const inputExists = existsSync(userInput)
            const inputIsDirectory = inputExists
              ? lstatSync(userInput).isDirectory()
              : false

            if (!inputExists || !inputIsDirectory) {
              options.push({
                value: userInput,
                label: userInput,
                hint: "create directory",
              })
            } else {
              options.push({
                value: userInput,
                label: userInput,
                hint: "use this directory",
              })
            }
          }

          const searchPath = resolveSearchPath(userInput)
          const items = readdirSync(searchPath)
            .map((item) => {
              const fullPath = join(searchPath, item)
              const stats = lstatSync(fullPath)
              return {
                path: fullPath,
                isDirectory: stats.isDirectory(),
              }
            })
            .filter(({ path, isDirectory }) => {
              if (!path.startsWith(userInput)) {
                return false
              }
              if (params.directory) {
                return isDirectory
              }
              return true
            })

          const dynamicOptions = items.map((item) => ({
            value: item.path,
          }))

          for (const dynamicOption of dynamicOptions) {
            if (options.some((option) => option.value === dynamicOption.value)) {
              continue
            }
            options.push(dynamicOption)
          }

          return options
        } catch {
          return []
        }
      },
    })
}

function resolveSearchPath(userInput: string): string {
  if (!existsSync(userInput)) {
    return dirname(userInput)
  }

  const stats = lstatSync(userInput)
  if (stats.isDirectory()) {
    return userInput.endsWith("/") ? userInput : dirname(userInput)
  }

  return dirname(userInput)
}
