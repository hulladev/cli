import { flag, option } from "@hulla/args"

export const helpFlag = flag({
  name: "help",
  short: "h",
  description: "Show the help message",
})

export const versionFlag = flag({
  name: "version",
  short: "v",
  description: "Show the version number",
})

export const yesFlag = flag({
  name: "yes",
  short: "y",
  description: "Run non-interactively and accept confirmations",
})

export const cleanFlag = flag({
  name: "clean",
  short: [],
  description: "Reserved; not currently supported",
})

export const configOption = option({
  name: "config",
  description:
    "Project config path; API commands use this for the generator config",
})

export const frameworkOption = option({
  name: "framework",
  description: "The framework to use",
})

export const cwdOption = option({
  name: "cwd",
  short: [],
  description: "Run in this project directory (default: current directory)",
})

export const projectConfigOption = option({
  name: "project-config",
  short: [],
  description: "Path to the hulla project config (default: .hulla/hulla.json)",
})

export const commonArguments = [
  helpFlag,
  yesFlag,
  configOption,
  cwdOption,
  projectConfigOption,
]

export const uiSetupArguments = [
  frameworkOption,
  ...[
    ["source", "UI registry URL or local directory (saved on setup)"],
    [
      "code-root",
      "Project-relative code root for @/ imports (default: detected or src)",
    ],
    [
      "components-root",
      "Component output directory (default: <code-root>/components)",
    ],
    ["copy-root", "Support-file output directory (default: <code-root>)"],
  ].map(([name, description]) => option({ name, short: [], description })),
]
