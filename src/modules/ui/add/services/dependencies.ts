import type { HullaConfig } from "@/app/types"
import { normalizePath } from "@/modules/ui/config"
import { classifyDependencySpecs } from "@/modules/ui/shared/dependency-versions"
import type { PackageJson } from "@/platform/package-json"
import { d } from "@/terminal/format"
import { box } from "@/terminal/prompts/box"
import { confirm } from "@/terminal/prompts/confirm"
import { log } from "@/terminal/prompts/log"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { dirname, join, relative } from "path"
import { platform } from "process"
import type { UIProjectConfigSchema } from "schemas/ui.types"

type KnownPostAddFormatter = "prettier" | "oxfmt" | "biome"

type FormatterExecutionPlan = {
  command: string
  args: string[]
  displayCommand: string
}

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

  log.info(`Running post add/update command on ${filesLabel}...`)
  const knownFormatter = parseKnownPostAddFormatter(configuredCommand)
  if (knownFormatter) {
    await runKnownPostAddFormatter({
      formatter: knownFormatter,
      projectRoot: input.projectRoot,
      files: input.changedFilePaths,
      stdout: "inherit",
      stderr: "inherit",
    })
    return
  }

  const script = buildShellPostAddUpdateCommand(
    configuredCommand,
    changedProjectRelativeFiles
  )
  await runShellPostAddUpdateCommand({
    projectRoot: input.projectRoot,
    script,
    stdout: "inherit",
    stderr: "inherit",
  })
}

export async function formatPostAddUpdateDiffPreview(input: {
  postAddUpdateStep: UIProjectConfigSchema["postAddUpdateStep"]
  projectRoot: string
  files: Array<{ path: string; content: string }>
}): Promise<Map<string, string>> {
  const configuredCommand = input.postAddUpdateStep.trim()
  const knownFormatter = parseKnownPostAddFormatter(configuredCommand)
  if (!knownFormatter || input.files.length === 0) {
    return new Map()
  }

  const tempRootParent = join(input.projectRoot, ".hulla", ".tmp")
  await mkdir(tempRootParent, { recursive: true })
  const tempRoot = await mkdtemp(join(tempRootParent, "ui-add-preview-"))

  try {
    const tempFiles = await Promise.all(
      input.files.map(async (file) => {
        const relativePath = normalizePath(
          relative(input.projectRoot, file.path)
        )
        const tempPath = join(tempRoot, relativePath)
        await mkdir(dirname(tempPath), { recursive: true })
        await Bun.write(tempPath, file.content)
        return {
          originalPath: file.path,
          tempPath,
        }
      })
    )

    try {
      await runKnownPostAddFormatter({
        formatter: knownFormatter,
        projectRoot: input.projectRoot,
        files: tempFiles.map((file) => file.tempPath),
        stdout: "ignore",
        stderr: "ignore",
      })
    } catch {
      return new Map()
    }

    const formattedByPath = new Map<string, string>()
    for (const file of tempFiles) {
      formattedByPath.set(
        file.originalPath,
        await Bun.file(file.tempPath).text()
      )
    }

    return formattedByPath
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
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

export function parseKnownPostAddFormatter(
  command: string
): KnownPostAddFormatter | null {
  const normalized = command.trim().replace(/\s+/g, " ")

  if (
    normalized === "prettier --write {files}" ||
    normalized === "npx prettier --write {files}" ||
    normalized === "bunx prettier --write {files}"
  ) {
    return "prettier"
  }
  if (
    normalized === "oxfmt {files}" ||
    normalized === "npx oxfmt {files}" ||
    normalized === "bunx oxfmt {files}"
  ) {
    return "oxfmt"
  }
  if (
    normalized === "biome format --write {files}" ||
    normalized === "npx biome format --write {files}" ||
    normalized === "bunx biome format --write {files}"
  ) {
    return "biome"
  }

  return null
}

function buildShellPostAddUpdateCommand(
  configuredCommand: string,
  files: string[]
): string {
  const escapedFiles = files.map(shellEscape).join(" ")
  return configuredCommand.includes("{files}")
    ? configuredCommand.replaceAll("{files}", escapedFiles)
    : `${configuredCommand} ${escapedFiles}`
}

async function runShellPostAddUpdateCommand(input: {
  projectRoot: string
  script: string
  stdout: "inherit" | "ignore"
  stderr: "inherit" | "ignore"
}): Promise<void> {
  const proc = Bun.spawn(["sh", "-lc", input.script], {
    cwd: input.projectRoot,
    stdout: input.stdout,
    stderr: input.stderr,
  })

  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to run post add/update command (exit code: ${proc.exitCode}).`
    )
  }
}

async function runKnownPostAddFormatter(input: {
  formatter: KnownPostAddFormatter
  projectRoot: string
  files: string[]
  stdout: "inherit" | "ignore"
  stderr: "inherit" | "ignore"
}): Promise<void> {
  const executionPlan = await resolveFormatterExecutionPlan(
    input.projectRoot,
    input.formatter
  )
  const formatterArgs =
    input.formatter === "prettier"
      ? ["--write"]
      : input.formatter === "biome"
        ? ["format", "--write"]
        : []

  const proc = Bun.spawn(
    [
      executionPlan.command,
      ...executionPlan.args,
      ...formatterArgs,
      ...input.files,
    ],
    {
      cwd: input.projectRoot,
      stdout: input.stdout,
      stderr: input.stderr,
    }
  )

  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to run post add/update command (exit code: ${proc.exitCode}).`
    )
  }
}

export async function resolveFormatterExecutionPlan(
  projectRoot: string,
  formatter: KnownPostAddFormatter
): Promise<FormatterExecutionPlan> {
  const suffix = platform === "win32" ? ".cmd" : ""
  const localExecutable = join(
    projectRoot,
    "node_modules",
    ".bin",
    `${formatter}${suffix}`
  )

  if (await Bun.file(localExecutable).exists()) {
    return {
      command: localExecutable,
      args: [],
      displayCommand: formatter,
    }
  }

  const packageJson = await readPackageJson(join(projectRoot, "package.json"))
  const hasFormatterDependency = Boolean(
    packageJson?.devDependencies?.[formatter] ??
      packageJson?.dependencies?.[formatter]
  )

  if (hasFormatterDependency) {
    return {
      command: formatter,
      args: [],
      displayCommand: formatter,
    }
  }

  const runner = await detectPackageExecutor(
    projectRoot,
    packageJson?.packageManager
  )
  return {
    command: runner,
    args: [formatter],
    displayCommand: `${runner} ${formatter}`,
  }
}

export async function buildFormatterPostAddCommand(input: {
  projectRoot: string
  formatter: KnownPostAddFormatter
}): Promise<string> {
  const executionPlan = await resolveFormatterExecutionPlan(
    input.projectRoot,
    input.formatter
  )
  const formatterArgs =
    input.formatter === "prettier"
      ? ["--write"]
      : input.formatter === "biome"
        ? ["format", "--write"]
        : []

  const commandParts =
    executionPlan.args.length > 0
      ? [executionPlan.command, ...executionPlan.args]
      : [executionPlan.displayCommand]

  return [...commandParts, ...formatterArgs, "{files}"].join(" ")
}

async function detectPackageExecutor(
  projectRoot: string,
  packageManager: string | undefined
): Promise<"bunx" | "npx"> {
  if (packageManager?.startsWith("bun@")) {
    return "bunx"
  }

  if (
    (await Bun.file(join(projectRoot, "bun.lock")).exists()) ||
    (await Bun.file(join(projectRoot, "bun.lockb")).exists())
  ) {
    return "bunx"
  }

  return "npx"
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
