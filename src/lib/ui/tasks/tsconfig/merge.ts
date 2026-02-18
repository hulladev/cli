import type { TsconfigJson } from "./parse"

type JsonValue = string | number | boolean | null | JsonValue[] | JsonRecord

type JsonRecord = {
  [key: string]: JsonValue
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeReferencePath(path: string): string {
  return path.replace(/\\/g, "/")
}

function unionReferences(
  target: unknown,
  source: unknown
): Array<{ path: string }> {
  const existing = Array.isArray(target)
    ? target.filter(
        (value): value is { path: string } =>
          !!value &&
          typeof value === "object" &&
          "path" in value &&
          typeof value.path === "string"
      )
    : []

  const incoming = Array.isArray(source)
    ? source.filter(
        (value): value is { path: string } =>
          !!value &&
          typeof value === "object" &&
          "path" in value &&
          typeof value.path === "string"
      )
    : []

  const seen = new Set(
    existing.map((entry) => normalizeReferencePath(entry.path))
  )
  const result = [...existing]

  for (const reference of incoming) {
    const normalized = normalizeReferencePath(reference.path)
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push({ path: reference.path })
  }

  return result
}

function mergeCompilerPaths(target: unknown, source: unknown): JsonRecord {
  const existing = isJsonRecord(target) ? target : {}
  const incoming = isJsonRecord(source) ? source : {}
  const result: JsonRecord = { ...existing }

  for (const [key, value] of Object.entries(incoming)) {
    // Do not override user-defined aliases (e.g. "@/*"), only add missing ones.
    if (!(key in result)) {
      result[key] = value as JsonValue
    }
  }

  return result
}

function deepMerge(
  target: unknown,
  source: unknown,
  path: string[] = []
): unknown {
  if (source === undefined) {
    return target
  }

  const keyPath = path.join(".")

  if (keyPath === "references") {
    return unionReferences(target, source)
  }

  if (keyPath === "compilerOptions.paths") {
    return mergeCompilerPaths(target, source)
  }

  if (Array.isArray(source)) {
    return source
  }

  if (!isJsonRecord(source)) {
    return source
  }

  const safeTarget = isJsonRecord(target) ? target : {}
  const result: JsonRecord = { ...safeTarget }

  for (const [key, value] of Object.entries(source)) {
    result[key] = deepMerge(result[key], value, [...path, key]) as JsonValue
  }

  return result
}

function sanitizeTemplate(
  templateConfig: TsconfigJson,
  options: {
    allowBaseUrl: boolean
  }
): TsconfigJson {
  const result: TsconfigJson = { ...templateConfig }

  // Template extends paths are authored for the UI monorepo and are invalid in user projects.
  if ("extends" in result) {
    delete result.extends
  }

  // Do not apply include globs from framework templates; keep user's include strategy.
  if ("include" in result) {
    delete result.include
  }

  if (options.allowBaseUrl) {
    return result
  }

  const compilerOptions = result.compilerOptions
  if (!isJsonRecord(compilerOptions) || !("baseUrl" in compilerOptions)) {
    return result
  }

  const restCompilerOptions = { ...compilerOptions }
  delete restCompilerOptions.baseUrl
  return {
    ...result,
    compilerOptions: restCompilerOptions,
  }
}

export function mergeWithFrameworkTemplate(
  existingConfig: TsconfigJson,
  templateConfig: TsconfigJson,
  options: {
    allowBaseUrl: boolean
  }
): TsconfigJson {
  const sanitizedTemplate = sanitizeTemplate(templateConfig, options)
  return deepMerge(existingConfig, sanitizedTemplate) as TsconfigJson
}

export function mergeReferencesIntoRoot(
  existingConfig: TsconfigJson,
  referencePaths: string[]
): TsconfigJson {
  const references = referencePaths.map((path) => ({ path }))
  return deepMerge(existingConfig, { references }) as TsconfigJson
}
