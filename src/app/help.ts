import type { ParserConfig } from "@hulla/args"
import { cliDefinition } from "./registry"
import type { ParserResult } from "./types"

type HelpDefinition = Pick<ParserConfig, "name" | "arguments"> & {
  description?: string
  alias?: string | string[]
  commands?: HelpDefinition[]
}

function names(value?: string | string[]): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function section(title: string, rows: [string, string][]): string {
  if (rows.length === 0) return ""
  const width = Math.max(...rows.map(([label]) => label.length))
  return `${title}:\n${rows
    .map(([label, description]) =>
      `  ${label.padEnd(width)}  ${description}`.trimEnd()
    )
    .join("\n")}`
}

/** Resolve help before config loading or command execution, at any command depth. */
export function getCommandHelp(result: ParserResult): string {
  const root: HelpDefinition = cliDefinition
  let definition = root
  let node: Pick<ParserResult, "arguments" | "commands"> = result
  const path = [root.name]

  while (true) {
    const child = definition.commands?.find(
      (command) => node.commands[command.name]?.detected
    )
    if (!child) break
    node = node.commands[child.name]
    definition = child
    path.push(child.name)
  }

  const args = definition.arguments ?? []
  const options = args.filter(
    (arg) => arg.type === "flag" || arg.type === "option"
  )
  const positional = args.filter(
    (arg) => arg.type !== "flag" && arg.type !== "option"
  )
  const commands = definition.commands ?? []
  const positionLabel = (arg: (typeof args)[number]) =>
    `[${arg.name}${arg.type === "infiniteSequence" ? "..." : ""}]`
  const usage = [
    ...path,
    ...(commands.length ? ["<command>"] : []),
    ...positional.map(positionLabel),
    ...(options.length ? ["[options]"] : []),
  ].join(" ")
  const aliases = names(definition.alias)

  const examples =
    path[1] === "ui"
      ? [
          "hulla ui add button dialog",
          "hulla ui add button --framework react-native --cwd apps/mobile",
          "hulla ui init --components-root src/components/ui",
          "hulla ui --check --cwd apps/mobile",
        ]
      : path[1] === "api"
        ? [
            "hulla api init",
            "hulla api generate",
            "hulla api dev --cwd apps/server",
            "hulla api --check --cwd apps/server",
          ]
        : path[1] === "doctor"
          ? ["hulla doctor", "hulla doctor --cwd apps/mobile"]
          : ["style", "db", "control"].includes(path[1])
            ? [
                `hulla ${path[1]} --check`,
                `hulla ${path[1]} --check --cwd apps/server`,
              ]
            : ["hulla ui add button dialog", "hulla doctor", "hulla ui --check"]

  return [
    `Usage: ${usage}`,
    definition.description,
    aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
    section(
      "Commands",
      commands.map((command) => {
        const aliases = names(command.alias)
        return [
          `${command.name}${aliases.length ? ` (${aliases.join(", ")})` : ""}`,
          command.description ?? "",
        ]
      })
    ),
    section(
      "Arguments",
      positional.map((arg) => [positionLabel(arg), arg.description ?? ""])
    ),
    section(
      "Options",
      options.map((arg) => {
        const named = arg as typeof arg & {
          short?: string | string[]
          long?: string | string[]
        }
        const label = [
          ...names(named.short).map((name) => `-${name}`),
          ...names(named.long).map((name) => `--${name}`),
        ].join(", ")
        return [
          `${label}${arg.type === "option" ? " <value>" : ""}`,
          arg.description ?? "",
        ]
      })
    ),
    section(
      "Examples",
      examples.map((example) => [example, ""])
    ),
    commands.length
      ? `Run '${path.join(" ")} <command> --help' for command details.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}
