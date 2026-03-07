import type { HullaConfig } from "@/app/types"
import {
  classifyDependencySpecs,
  extractDependencyName,
} from "@/modules/ui/shared/dependency-versions"
import type { PackageJson } from "@/platform/package-json"
import { d } from "@/terminal/format"
import { box } from "@/terminal/prompts/box"
import { confirm } from "@/terminal/prompts/confirm"
import { log } from "@/terminal/prompts/log"
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

  const dependencyMap = new Map<string, string>()
  const devDependencyMap = new Map<string, string>()

  for (const dependency of dependencies) {
    const dependencyName = extractDependencyName(dependency)
    if (!dependencyName) {
      continue
    }
    dependencyMap.set(
      dependencyName,
      dependencyName === dependency ? "*" : dependency.slice(dependencyName.length + 1)
    )
  }

  for (const dependency of devDependencies) {
    const dependencyName = extractDependencyName(dependency)
    if (!dependencyName) {
      continue
    }
    devDependencyMap.set(
      dependencyName,
      dependencyName === dependency ? "*" : dependency.slice(dependencyName.length + 1)
    )
  }

  for (const dependencyName of dependencyMap.keys()) {
    devDependencyMap.delete(dependencyName)
  }

  const {
    toInstall,
    toUpdate,
    satisfied,
  } = classifyDependencySpecs({
    dependencies: dependencyMap.entries(),
    projectPackageJson,
  })
  const {
    toInstall: toInstallDev,
    toUpdate: toUpdateDev,
    satisfied: satisfiedDev,
  } = classifyDependencySpecs({
    dependencies: devDependencyMap.entries(),
    projectPackageJson,
  })

  if (
    toInstall.length === 0 &&
    toInstallDev.length === 0 &&
    toUpdate.length === 0 &&
    toUpdateDev.length === 0
  ) {
    if (satisfied.length > 0 || satisfiedDev.length > 0) {
      log.info("All framework dependencies are already installed.")
    }
    return
  }

  const lines: string[] = []
  if (toInstall.length > 0) {
    lines.push(d.highlight("Dependencies:"))
    for (const dep of toInstall) {
      lines.push(`  ${d.success("+")} ${dep}`)
    }
  }

  if (toUpdate.length > 0) {
    if (lines.length > 0) {
      lines.push("")
    }
    lines.push(d.highlight("Updates required:"))
    for (const dep of toUpdate) {
      lines.push(
        `  ${d.success("~")} ${dep.spec} ${d.secondary(`(installed: ${dep.installed})`)}`
      )
    }
  }

  if (toInstallDev.length > 0) {
    if (lines.length > 0) {
      lines.push("")
    }
    lines.push(d.highlight("Dev dependencies:"))
    for (const dep of toInstallDev) {
      lines.push(`  ${d.success("+")} ${dep}`)
    }
  }

  if (toUpdateDev.length > 0) {
    if (lines.length > 0) {
      lines.push("")
    }
    lines.push(d.highlight("Dev dependency updates required:"))
    for (const dep of toUpdateDev) {
      lines.push(
        `  ${d.success("~")} ${dep.spec} ${d.secondary(`(installed: ${dep.installed})`)}`
      )
    }
  }

  if (satisfied.length > 0 || satisfiedDev.length > 0) {
    if (lines.length > 0) {
      lines.push("")
    }
    lines.push(d.secondary("Already installed:"))
    for (const dep of satisfied) {
      lines.push(`  ${d.secondary("~")} ${dep.name}@${dep.installed}`)
    }
    for (const dep of satisfiedDev) {
      lines.push(`  ${d.secondary("~")} ${dep.name}@${dep.installed}`)
    }
  }

  box(lines.join("\n"), "Framework dependencies")

  const shouldInstall = await confirm({
    message:
      "Install or update framework dependencies required by this UI library now?",
    initialValue: true,
  })
  if (!shouldInstall) {
    log.warn(
      "Skipped framework dependency installation/update. Install these dependencies manually before using the components."
    )
    return
  }

  const depsPackages = [
    ...toInstall,
    ...toUpdate.map((dependency) => dependency.spec),
  ]
  if (depsPackages.length > 0) {
    await runInstallScript({
      script: config.cli.scripts.add,
      packages: depsPackages,
      cwd: projectRoot,
    })
  }

  const devDepsPackages = [
    ...toInstallDev,
    ...toUpdateDev.map((dependency) => dependency.spec),
  ]
  if (devDepsPackages.length > 0) {
    await runInstallScript({
      script: config.cli.scripts.addDev,
      packages: devDepsPackages,
      cwd: projectRoot,
    })
  }
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
