import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const LOCAL_SOURCE_PREFIXES = ["./", "../", "/", "~/", "file://"]

function isHttpUrl(source: string): boolean {
  if (!URL.canParse(source)) {
    return false
  }

  const url = new URL(source)
  return url.protocol === "http:" || url.protocol === "https:"
}

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

  if (LOCAL_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix))) {
    return true
  }

  if (isHttpUrl(source)) {
    return false
  }

  return true
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
