import { existsSync, realpathSync, statSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path"

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || (code >= 127 && code <= 159)
  })
}

export function validateProjectDirectory(
  value: string,
  root: string
): string | undefined {
  if (hasControlCharacters(value)) {
    return "Path must not contain control characters"
  }
  if (!value.trim()) return "Path is required"
  const normalized = value.trim().replace(/\\/g, "/")
  if (isAbsolute(normalized) || win32.isAbsolute(normalized)) {
    return "Use a project-relative path"
  }
  const destination = resolve(root, normalized)
  const fromRoot = relative(root, destination)
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    return "Path must stay inside the project"
  }
  let existing = destination
  while (!existsSync(existing)) existing = dirname(existing)
  try {
    if (!statSync(existing).isDirectory())
      return "Path must be a directory; a file blocks this path"
    const actualPath = relative(realpathSync(root), realpathSync(existing))
    if (
      actualPath === ".." ||
      actualPath.startsWith(`..${sep}`) ||
      isAbsolute(actualPath)
    ) {
      return "Path must stay inside the project"
    }
  } catch {
    return "Cannot read this directory"
  }
  return undefined
}
