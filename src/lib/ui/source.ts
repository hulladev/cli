import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const LOCAL_SOURCE_PREFIXES = ["./", "../", "/", "~/", "file://"]

export type ResolvedUISource =
  | {
      kind: "local"
      source: string
      rootDir: string
    }
  | {
      kind: "remote"
      sourceUrl: string
    }

export function isLocalUISource(source: string): boolean {
  if (source === "~") {
    return true
  }

  return LOCAL_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix))
}

export function resolveLocalUISourceRoot(
  source: string,
  projectRoot: string
): string {
  if (source.startsWith("file://")) {
    return fileURLToPath(source)
  }

  const resolvedTildePath = resolveTilde(source)
  if (isAbsolute(resolvedTildePath)) {
    return resolvedTildePath
  }

  return resolve(projectRoot, resolvedTildePath)
}

export function resolveUISource(input: {
  source: string
  projectRoot: string
}): ResolvedUISource {
  if (isLocalUISource(input.source)) {
    return {
      kind: "local",
      source: input.source,
      rootDir: resolveLocalUISourceRoot(input.source, input.projectRoot),
    }
  }

  return {
    kind: "remote",
    sourceUrl: input.source,
  }
}

function resolveTilde(path: string): string {
  if (path === "~") {
    return homedir()
  }

  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2))
  }

  return path
}
