import type { HullaConfig } from "@/app/types"
import { normalizePath } from "@/modules/ui/config"
import { classifyDependencySpecs } from "@/modules/ui/shared/dependency-versions"
import type { PackageJson } from "@/platform/package-json"
import { d } from "@/terminal/format"
import { box } from "@/terminal/prompts/box"
import { confirm } from "@/terminal/prompts/confirm"
import { log } from "@/terminal/prompts/log"
import { join, relative } from "path"
import type { UIProjectConfigSchema } from "schemas/ui.types"

export async function installComponentDependencies(input: {
  config: HullaConfig
  projectRoot: string
  componentPackageJsonPaths: string[]
}): Promise<void> {
  if (input.componentPackageJsonPaths.length === 0) {
    return
  }

  const projectPackageJson = await readPackageJson(
    join(input.projectRoot, "package.json")
  )

  const depsMap = new Map<string, string>()
  const devDepsMap = new Map<string, string>()

  for (const packageJsonPath of input.componentPackageJsonPaths) {
    const packageJson = await readPackageJson(packageJsonPath)
    if (!packageJson) {
      continue
    }

    for (const [name, version] of Object.entries(
      packageJson.dependencies ?? {}
    )) {
      if (!depsMap.has(name)) {
        depsMap.set(name, version)
      }
    }

    for (const [name, version] of Object.entries(
      packageJson.devDependencies ?? {}
    )) {
      if (!devDepsMap.has(name)) {
        devDepsMap.set(name, version)
      }
    }
  }

  for (const dependencyName of depsMap.keys()) {
    devDepsMap.delete(dependencyName)
  }

  const {
    toInstall: depsToInstall,
    toUpdate: depsToUpdate,
    satisfied: satisfiedDeps,
  } = classifyDependencySpecs({
    dependencies: depsMap.entries(),
    projectPackageJson,
  })
  const {
    toInstall: devDepsToInstall,
    toUpdate: devDepsToUpdate,
    satisfied: satisfiedDevDeps,
  } = classifyDependencySpecs({
    dependencies: devDepsMap.entries(),
    projectPackageJson,
  })

  const hasAnythingToInstall =
    depsToInstall.length > 0 ||
    devDepsToInstall.length > 0 ||
    depsToUpdate.length > 0 ||
    devDepsToUpdate.length > 0
  if (!hasAnythingToInstall) {
    if (satisfiedDeps.length > 0 || satisfiedDevDeps.length > 0) {
      log.info("All dependencies from added components are already installed.")
    }
    return
  }

  const boxLines: string[] = []
  if (depsToInstall.length > 0) {
    boxLines.push(d.highlight("Dependencies:"))
    for (const dependency of depsToInstall) {
      boxLines.push(`  ${d.success("+")} ${dependency}`)
    }
  }

  if (depsToUpdate.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.highlight("Updates required:"))
    for (const dependency of depsToUpdate) {
      boxLines.push(
        `  ${d.success("~")} ${dependency.spec} ${d.secondary(`(installed: ${dependency.installed})`)}`
      )
    }
  }

  if (devDepsToInstall.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.highlight("Dev Dependencies:"))
    for (const dependency of devDepsToInstall) {
      boxLines.push(`  ${d.success("+")} ${dependency}`)
    }
  }

  if (devDepsToUpdate.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.highlight("Dev dependency updates required:"))
    for (const dependency of devDepsToUpdate) {
      boxLines.push(
        `  ${d.success("~")} ${dependency.spec} ${d.secondary(`(installed: ${dependency.installed})`)}`
      )
    }
  }

  const satisfied = [...satisfiedDeps, ...satisfiedDevDeps]
  if (satisfied.length > 0) {
    if (boxLines.length > 0) {
      boxLines.push("")
    }
    boxLines.push(d.secondary("Already installed:"))
    for (const dependency of satisfied) {
      boxLines.push(
        `  ${d.secondary("~")} ${dependency.name}@${dependency.installed}`
      )
    }
  }

  box(boxLines.join("\n"), "Component dependencies")

  const shouldInstall = await confirm({
    message: "Install or update dependencies required by added components now?",
    initialValue: true,
  })
  if (!shouldInstall) {
    log.warn(
      "Skipped dependency installation/update. Install these dependencies manually before using the components."
    )
    return
  }

  const depsPackages = [
    ...depsToInstall,
    ...depsToUpdate.map((dependency) => dependency.spec),
  ]
  if (depsPackages.length > 0) {
    await runInstallScript({
      script: input.config.cli.scripts.add,
      packages: depsPackages,
      label: "dependencies",
      cwd: input.projectRoot,
    })
  }

  const devDepsPackages = [
    ...devDepsToInstall,
    ...devDepsToUpdate.map((dependency) => dependency.spec),
  ]
  if (devDepsPackages.length > 0) {
    await runInstallScript({
      script: input.config.cli.scripts.addDev,
      packages: devDepsPackages,
      label: "dev dependencies",
      cwd: input.projectRoot,
    })
  }
}

export async function runPostAddUpdateStep(input: {
  postAddUpdateStep: UIProjectConfigSchema["postAddUpdateStep"]
  projectRoot: string
  changedFilePaths: string[]
}): Promise<void> {
  const configuredCommand = input.postAddUpdateStep.trim()
  if (!configuredCommand || input.changedFilePaths.length === 0) {
    return
  }

  const changedProjectRelativeFiles = input.changedFilePaths.map((path) =>
    normalizePath(relative(input.projectRoot, path))
  )
  const filesLabel =
    changedProjectRelativeFiles.length === 1
      ? "1 file"
      : `${changedProjectRelativeFiles.length} files`
  const escapedFiles = changedProjectRelativeFiles.map(shellEscape).join(" ")
  const script = configuredCommand.includes("{files}")
    ? configuredCommand.replaceAll("{files}", escapedFiles)
    : `${configuredCommand} ${escapedFiles}`

  log.info(`Running post add/update command on ${filesLabel}...`)
  const proc = Bun.spawn(["sh", "-lc", script], {
    cwd: input.projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  })

  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to run post add/update command (exit code: ${proc.exitCode}).`
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

async function runInstallScript(input: {
  script: string
  packages: string[]
  label: string
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
      `Failed to install ${input.label} (exit code: ${proc.exitCode}).`
    )
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
