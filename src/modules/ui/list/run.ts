import { getStringOption } from "@/app/options"
import { commandErr, commandOkMessage } from "@/app/result"
import type { CommandContext, ParserResult } from "@/app/types"
import { log } from "@/terminal/prompts/log"
import {
  componentInstallCommand,
  filterComponentCatalog,
  inspectComponentCatalog,
  loadCatalogFrameworks,
} from "./catalog"

export async function runUiList({
  context,
  result,
}: {
  context: CommandContext
  result: ParserResult["commands"]["ui"]["commands"]["list"]
}) {
  const framework = getStringOption(context.parserResult, "framework")
  const frameworks = await loadCatalogFrameworks(
    context.config,
    getStringOption(context.parserResult, "source")
  )
  const selected = framework
    ? frameworks.filter(
        (item) => item.frameworkName.toLowerCase() === framework.toLowerCase()
      )
    : frameworks
  if (!selected.length)
    return commandErr(
      new Error(
        `No matching framework. Available: ${[...new Set(frameworks.map((item) => item.frameworkName))].join(", ")}`
      )
    )
  const values = result.arguments.query?.value
  const query = Array.isArray(values) ? values.join(" ") : ""
  const entries = filterComponentCatalog(
    await inspectComponentCatalog(selected),
    query
  )
  for (const entry of entries) {
    log.info(
      `${entry.family} [${entry.framework}] — ${entry.library}\n  source: ${entry.source}\n  exports: ${entry.exports.join(", ") || "(none detected)"}\n  files: ${entry.files.join(", ")}\n  install: ${componentInstallCommand(entry)}`
    )
  }
  return commandOkMessage(
    `${entries.length} component ${entries.length === 1 ? "family" : "families"} found`
  )
}
