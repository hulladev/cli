import { d } from "@/decorators"
import type { PackageJson } from "@/lib/shared/getPackageFiles"
import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import type { HullaConfig } from "@/types"
import { join } from "path"

type CreateUiDepsTaskInput = {
  config: HullaConfig
  projectRoot: string
  dependencies: string[]
  devDependencies: string[]
}

export async function createUiDepsTask({
  config,
  projectRoot,
  dependencies,
  devDependencies,
}: CreateUiDepsTaskInput): Promise<void> {
  if (dependencies.length === 0 && devDependencies.length === 0) {
    return
  }

  const projectPackageJson = await readPackageJson(
    join(projectRoot, "package.json")
  )
  const installedDeps = new Set<string>([
    ...Object.keys(projectPackageJson?.dependencies ?? {}),
    ...Object.keys(projectPackageJson?.devDependencies ?? {}),
  ])

  const toInstall: string[] = []
  const skipped: string[] = []
  const toInstallDev: string[] = []
  const skippedDev: string[] = []

  for (const dependency of dependencies) {
    const dependencyName = extractDependencyName(dependency)
    if (!dependencyName) {
      continue
    }

    if (installedDeps.has(dependencyName)) {
      skipped.push(dependency)
      continue
    }

    toInstall.push(dependency)
  }

  for (const dependency of devDependencies) {
    const dependencyName = extractDependencyName(dependency)
    if (!dependencyName) {
      continue
    }

    if (installedDeps.has(dependencyName)) {
      skippedDev.push(dependency)
      continue
    }

    toInstallDev.push(dependency)
  }

  if (toInstall.length === 0 && toInstallDev.length === 0) {
    if (skipped.length > 0 || skippedDev.length > 0) {
      log.info("All framework dependencies are already installed.")
    }
    return
  }

  const lines: string[] = [d.highlight("Dependencies:")]
  for (const dep of toInstall) {
    lines.push(`  ${d.success("+")} ${dep}`)
  }

  if (toInstallDev.length > 0) {
    lines.push("")
    lines.push(d.highlight("Dev dependencies:"))
    for (const dep of toInstallDev) {
      lines.push(`  ${d.success("+")} ${dep}`)
    }
  }

  if (skipped.length > 0 || skippedDev.length > 0) {
    lines.push("")
    lines.push(d.secondary("Already installed:"))
    for (const dep of skipped) {
      lines.push(`  ${d.secondary("~")} ${dep}`)
    }
    for (const dep of skippedDev) {
      lines.push(`  ${d.secondary("~")} ${dep}`)
    }
  }

  box(lines.join("\n"), "Framework dependencies")

  const shouldInstall = await confirm({
    message: "Install framework dependencies required by this UI library now?",
    initialValue: true,
  })
  if (!shouldInstall) {
    log.warn(
      "Skipped framework dependency installation. Install these dependencies manually before using the components."
    )
    return
  }

  if (toInstall.length > 0) {
    await runInstallScript({
      script: config.cli.scripts.add,
      packages: toInstall,
      cwd: projectRoot,
    })
  }

  if (toInstallDev.length > 0) {
    await runInstallScript({
      script: config.cli.scripts.addDev,
      packages: toInstallDev,
      cwd: projectRoot,
    })
  }
}

function extractDependencyName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return ""
  }

  if (trimmed.startsWith("@")) {
    const separator = trimmed.indexOf("@", 1)
    if (separator === -1) {
      return trimmed
    }
    return trimmed.slice(0, separator)
  }

  const separator = trimmed.indexOf("@")
  if (separator === -1) {
    return trimmed
  }
  return trimmed.slice(0, separator)
}

async function runInstallScript(input: {
  script: string
  packages: string[]
  cwd: string
}): Promise<void> {
  const [command, ...args] = input.script.split(" ")
  const proc = Bun.spawn([command, ...args, ...input.packages], {
    cwd: input.cwd,
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to install framework dependencies (exit code: ${proc.exitCode}).`
    )
  }
}

async function readPackageJson(path: string): Promise<PackageJson | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    return null
  }
  try {
    return (await file.json()) as PackageJson
  } catch {
    return null
  }
}
