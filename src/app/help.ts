import { checkFlag, commonArguments, versionFlag } from "./arguments"
import { detectedNodes } from "./options"
import { commandModules } from "./registry"
import type { ParserResult } from "./types"

type HelpArgument = {
  name: string
  type: string
  description?: string
  short?: string | string[]
}
type HelpCommand = {
  name: string
  description?: string
  alias?: string | string[]
  arguments: HelpArgument[]
  commands: HelpCommand[]
}

export function getCommandHelp(result: ParserResult): string {
  const root: HelpCommand = {
    name: "hulla",
    description:
      "Configure projects, install UI source, and generate API clients.",
    arguments: [versionFlag, checkFlag, ...commonArguments],
    commands: commandModules
      .filter((module) => module.name !== "install")
      .map((module) => module.definition as HelpCommand),
  }
  let current = root
  const names = ["hulla"]
  let parent = result.commands
  for (const node of detectedNodes(result).slice(1)) {
    const selected = current.commands.find(
      (command) => parent[command.name] === node
    )
    if (!selected) break
    names.push(selected.name)
    current = selected
    parent = node.commands
  }
  const positionals = current.arguments
    .filter((arg) => arg.type === "infiniteSequence")
    .map((arg) => `[${arg.name}…]`)
  const lines = [
    current.description ?? "",
    "",
    `Usage: ${names.join(" ")}${current.commands.length ? " <command>" : ""}${positionals.length ? ` ${positionals.join(" ")}` : ""} [options]`,
  ]
  if (current.commands.length) {
    lines.push(
      "",
      "Commands:",
      ...current.commands.map(
        (command) => `  ${command.name.padEnd(16)} ${command.description ?? ""}`
      )
    )
  }
  lines.push(
    "",
    "Options:",
    ...current.arguments
      .filter((arg) => arg.type === "flag" || arg.type === "option")
      .map((arg) => {
        const short = Array.isArray(arg.short) ? arg.short[0] : arg.short
        const label = `${short ? `-${short}, ` : "    "}--${arg.name}${arg.type === "option" ? " <value>" : ""}`
        return `  ${label.padEnd(33)} ${arg.description ?? ""}`
      })
  )
  const examples =
    names[1] === "ui"
      ? [
          "hulla ui add button dialog",
          "hulla ui add button --framework react-native --cwd apps/mobile",
          "hulla ui init --components-root src/components/ui",
          "hulla ui --check --cwd apps/mobile",
        ]
      : names[1] === "api"
        ? [
            "hulla api init",
            "hulla api generate",
            "hulla api dev --cwd apps/server",
            "hulla api --check --cwd apps/server",
          ]
        : names[1] === "doctor"
          ? ["hulla doctor", "hulla doctor --cwd apps/mobile"]
          : ["style", "db", "control"].includes(names[1])
            ? [
                `hulla ${names[1]} --check`,
                `hulla ${names[1]} --check --cwd apps/server`,
              ]
            : ["hulla ui add button dialog", "hulla doctor", "hulla ui --check"]
  lines.push("", "Examples:", ...examples.map((example) => `  ${example}`))
  return lines.join("\n")
}
