import type { UIAddResolvedComponent } from "@/modules/ui/types"
import { log } from "@/terminal/prompts/log"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import {
  findEntryPath,
  injectGlobalStyleImport,
  selectHostFramework,
} from "../init/services/global-styles"

// A registry family may ship CSS through its package.json's standard style field.
// Keep it opt-in: only selected families activate styles in the host entrypoint.
export async function activateComponentStyles(input: {
  projectRoot: string
  frameworks: string[]
  components: UIAddResolvedComponent[]
}): Promise<string[]> {
  const styles = new Set<string>()
  for (const component of input.components) {
    const packagePath = join(component.sourceComponentDir, "package.json")
    if (!(await Bun.file(packagePath).exists())) continue
    const metadata = await Bun.file(packagePath).json()
    if (metadata.style === undefined) continue
    const style = metadata.style
    if (
      typeof style !== "string" ||
      !style.endsWith(".css") ||
      isAbsolute(style)
    ) {
      throw new Error(
        `Invalid component stylesheet in ${packagePath}: expected a relative .css path`
      )
    }
    const source = resolve(component.sourceComponentDir, style)
    assertWithin(component.sourceComponentDir, source)
    if (!(await Bun.file(source).exists()))
      throw new Error(`Component stylesheet is missing: ${source}`)
    const destination = resolve(
      input.projectRoot,
      component.outputPath,
      component.componentName,
      style
    )
    const componentRoot = resolve(
      input.projectRoot,
      component.outputPath,
      component.componentName
    )
    assertWithin(componentRoot, destination)
    assertWithin(input.projectRoot, destination)
    if (!(await Bun.file(destination).exists()))
      throw new Error(`Component stylesheet was not installed: ${destination}`)
    styles.add(destination)
  }
  if (styles.size === 0) return []
  const host = selectHostFramework(input.frameworks.map((name) => ({ name })))
  const entry = host && (await findEntryPath(input.projectRoot, host))
  if (!host || !entry) {
    log.warn(
      `Import ${[...styles].map((path) => relative(input.projectRoot, path)).join(", ")} from your application entrypoint to activate the component styles.`
    )
    return []
  }
  const before = await Bun.file(entry).text()
  let after = before
  for (const style of styles) {
    const path = relative(dirname(entry), style).split(sep).join("/")
    after = injectGlobalStyleImport(
      after,
      path.startsWith(".") ? path : `./${path}`,
      host
    )
  }
  if (before === after) return []
  await Bun.write(entry, after)
  log.info(
    `Activated component styles in ${relative(input.projectRoot, entry)}.`
  )
  return [entry]
}

export async function removeComponentStyles(input: {
  projectRoot: string
  frameworks: string[]
  componentRoot: string
}): Promise<void> {
  const host = selectHostFramework(input.frameworks.map((name) => ({ name })))
  const entry = host && (await findEntryPath(input.projectRoot, host))
  if (!entry) return
  const before = await Bun.file(entry).text()
  // Remove only side-effect CSS imports inside the directory being uninstalled.
  const after = before.replace(
    /^[\t ]*import\s*["']([^"'\r\n]+\.css)["'];?[\t ]*\r?\n/gm,
    (statement, specifier: string) => {
      if (!specifier.startsWith(".")) return statement
      const destination = resolve(dirname(entry), specifier)
      return isWithin(input.componentRoot, destination) ? "" : statement
    }
  )
  if (after !== before) await Bun.write(entry, after)
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  )
}

function assertWithin(parent: string, child: string): void {
  if (!isWithin(parent, child))
    throw new Error(`Component stylesheet escapes its directory: ${child}`)
}
