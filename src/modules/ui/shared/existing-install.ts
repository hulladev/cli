import { parseRepository } from "@hulla/gittar"
import type { UIProjectInstall } from "../config"
import { resolveUISource } from "../source"

function identity(source: string, projectRoot: string): string | null {
  const resolved = resolveUISource({ source, projectRoot })
  if (resolved.kind === "local") return `local:${resolved.rootDir}`
  const parsed = parseRepository(resolved.sourceUrl)
  return parsed ? JSON.stringify([parsed.repository, parsed.subpath]) : null
}

export function findExistingInstall(input: {
  installs: UIProjectInstall[]
  source: string
  libraryName: string
  projectRoot: string
}): UIProjectInstall | undefined {
  const exact = input.installs.filter(
    (install) =>
      install.sourceUrl === input.source &&
      install.libraryName === input.libraryName
  )
  const key = identity(input.source, input.projectRoot)
  const matches = exact.length
    ? exact
    : key === null
      ? []
      : input.installs.filter(
          (install) =>
            install.libraryName === input.libraryName &&
            identity(install.sourceUrl, input.projectRoot) === key
        )
  if (matches.length > 1)
    throw new Error(
      `Multiple saved installs match ${input.libraryName}. Select one registry/configuration before changing its revision.`
    )
  return matches[0]
}
