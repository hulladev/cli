import { box } from "@/prompts/box"
import { confirm } from "@/prompts/confirm"
import { log } from "@/prompts/log"
import { select } from "@/prompts/select"
import { text } from "@/prompts/text"
import type { TsconfigPatchPlan, UISelectedFramework } from "@/types"
import { dirname, isAbsolute, relative, resolve } from "path"
import z from "zod"
import { applyTsconfigPatches } from "./tsconfig/apply"
import { createUnifiedDiff } from "./tsconfig/diff"
import { discoverTsconfigPaths } from "./tsconfig/discover"
import {
  mergeReferencesIntoRoot,
  mergeWithFrameworkTemplate,
} from "./tsconfig/merge"
import { readTsconfigFile } from "./tsconfig/parse"
import { renderTsconfig } from "./tsconfig/render"
import {
  canAddBaseUrl,
  getTypescriptMajorVersion,
} from "./tsconfig/typescriptVersion"

const CUSTOM_PATH = "__custom_path__"
const CREATE_NEW = "__create_new__"

type CreateUiTsconfigTaskInput = {
  selectedFrameworks: UISelectedFramework[]
}

type WorkingTsconfig = {
  beforeText: string
  exists: boolean
  config: Record<string, unknown>
}

export async function createUiTsconfigTask({
  selectedFrameworks,
}: CreateUiTsconfigTaskInput): Promise<void> {
  if (selectedFrameworks.length === 0) {
    log.warn("No frameworks selected. Skipping tsconfig changes.")
    return
  }

  const cwd = process.cwd()
  const existingTsconfigs = await discoverTsconfigPaths(cwd)
  const normalizedFrameworks = await filterValidFrameworks(selectedFrameworks)

  if (normalizedFrameworks.length === 0) {
    log.warn(
      "No framework tsconfig templates found. Skipping tsconfig changes."
    )
    return
  }

  const tsMajor = await getTypescriptMajorVersion(cwd)
  const allowBaseUrl = canAddBaseUrl(tsMajor)
  if (!allowBaseUrl) {
    log.info(
      "TypeScript 6+ (or unknown) detected. Skipping new baseUrl additions."
    )
  }

  const workingByPath = new Map<string, WorkingTsconfig>()

  if (normalizedFrameworks.length === 1) {
    const framework = normalizedFrameworks[0]
    const tsconfigPath = await requestTsconfigPath({
      message: `Select tsconfig.json for ${framework.name}`,
      existingTsconfigs,
      defaultNewPath: "./tsconfig.json",
    })

    const working = await getWorkingTsconfig(workingByPath, tsconfigPath)
    working.config = mergeWithFrameworkTemplate(
      working.config,
      framework.templateConfig,
      {
        allowBaseUrl,
      }
    ) as Record<string, unknown>
  } else {
    const rootPath = await requestTsconfigPath({
      message: "Select root tsconfig.json for project references",
      existingTsconfigs,
      defaultNewPath: "./tsconfig.json",
    })

    const frameworkPaths: Array<{ framework: string; path: string }> = []
    for (const framework of normalizedFrameworks) {
      const frameworkPath = await requestTsconfigPath({
        message: `Select tsconfig.json path for ${framework.name}`,
        existingTsconfigs,
        defaultNewPath: `./src/${framework.name.toLowerCase()}/tsconfig.json`,
      })

      frameworkPaths.push({
        framework: framework.name,
        path: frameworkPath,
      })

      const working = await getWorkingTsconfig(workingByPath, frameworkPath)
      working.config = mergeWithFrameworkTemplate(
        working.config,
        framework.templateConfig,
        { allowBaseUrl }
      ) as Record<string, unknown>
    }

    const rootWorking = await getWorkingTsconfig(workingByPath, rootPath)
    const referencePaths = frameworkPaths.map(({ path }) =>
      toReferencePath(rootPath, path)
    )
    rootWorking.config = mergeReferencesIntoRoot(
      rootWorking.config,
      referencePaths
    ) as Record<string, unknown>
  }

  const patches = buildPatchPlans(workingByPath)
  if (patches.length === 0) {
    log.info("No tsconfig changes required.")
    return
  }

  for (const patch of patches) {
    const relativePath = relative(cwd, patch.targetPath) || patch.targetPath
    box(createUnifiedDiff(patch, cwd), `Proposed changes: ${relativePath}`)
  }

  const shouldApply = await confirm({
    message: "Apply these tsconfig changes?",
    initialValue: true,
  })

  if (!shouldApply) {
    log.warn("Skipped tsconfig changes.")
    return
  }

  await applyTsconfigPatches(patches)
  log.info("tsconfig changes applied successfully.")
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/")
}

function toAbsolutePath(path: string, cwd: string): string {
  return isAbsolute(path)
    ? normalizePath(path)
    : normalizePath(resolve(cwd, path))
}

function toRelativeDisplay(path: string, cwd: string): string {
  const relPath = normalizePath(relative(cwd, path))
  return relPath.length > 0 ? relPath : "tsconfig.json"
}

function toReferencePath(
  rootTsconfigPath: string,
  frameworkTsconfigPath: string
): string {
  const reference = normalizePath(
    relative(dirname(rootTsconfigPath), frameworkTsconfigPath)
  )
  if (reference.length === 0) return "./tsconfig.json"
  return reference.startsWith(".") ? reference : `./${reference}`
}

async function requestTsconfigPath(input: {
  message: string
  existingTsconfigs: string[]
  defaultNewPath: string
}): Promise<string> {
  const cwd = process.cwd()
  const options = [
    ...input.existingTsconfigs.map((path, index) => ({
      label: toRelativeDisplay(path, cwd),
      hint: index === 0 ? "Recommended" : undefined,
      value: path,
    })),
    {
      label: "Custom existing path",
      value: CUSTOM_PATH,
      hint: "Use an existing tsconfig.json path",
    },
    {
      label: "Create new tsconfig file",
      value: CREATE_NEW,
      hint: "Create a new tsconfig.json file path",
    },
  ]

  const selected = await select<string>({
    message: input.message,
    options,
    initialValue: input.existingTsconfigs[0] ?? CREATE_NEW,
  })

  if (selected === CUSTOM_PATH) {
    return requestCustomExistingPath()
  }

  if (selected === CREATE_NEW) {
    return requestNewFilePath(input.defaultNewPath)
  }

  return selected
}

async function requestCustomExistingPath(): Promise<string> {
  const input = await text({
    message: "Enter existing tsconfig.json path",
    placeholder: "./tsconfig.json",
    validate: validateTsconfigPath,
  })

  const absolutePath = toAbsolutePath(input, process.cwd())
  const file = Bun.file(absolutePath)
  if (!(await file.exists())) {
    log.error(`File ${absolutePath} does not exist`)
    return requestCustomExistingPath()
  }

  return absolutePath
}

async function requestNewFilePath(defaultPath: string): Promise<string> {
  const input = await text({
    message: "Enter new tsconfig.json file path",
    placeholder: defaultPath,
    initialValue: defaultPath,
    validate: validateTsconfigPath,
  })

  return toAbsolutePath(input, process.cwd())
}

function validateTsconfigPath(value: string | undefined): string | undefined {
  const result = z
    .string()
    .min(1)
    .endsWith(".json")
    .safeParse(value ?? "")
  return result.error?.message
}

async function getWorkingTsconfig(
  map: Map<string, WorkingTsconfig>,
  targetPath: string
): Promise<WorkingTsconfig> {
  if (map.has(targetPath)) {
    return map.get(targetPath) as WorkingTsconfig
  }

  const loaded = await readTsconfigFile(targetPath)
  const working: WorkingTsconfig = {
    beforeText: loaded.text,
    exists: loaded.exists,
    config: loaded.config,
  }

  map.set(targetPath, working)
  return working
}

function buildPatchPlans(
  map: Map<string, WorkingTsconfig>
): TsconfigPatchPlan[] {
  const plans: TsconfigPatchPlan[] = []
  for (const [targetPath, working] of map) {
    const afterText = renderTsconfig(working.config)
    if (
      working.exists &&
      normalizeLineEndings(working.beforeText) ===
        normalizeLineEndings(afterText)
    ) {
      continue
    }
    plans.push({
      targetPath,
      beforeText: working.beforeText,
      afterText,
      mode: working.exists ? "update" : "create",
    })
  }
  return plans
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

async function filterValidFrameworks(
  frameworks: UISelectedFramework[]
): Promise<
  Array<UISelectedFramework & { templateConfig: Record<string, unknown> }>
> {
  const valid: Array<
    UISelectedFramework & { templateConfig: Record<string, unknown> }
  > = []
  for (const framework of frameworks) {
    const loaded = await readTsconfigFile(framework.templateTsconfigPath)
    if (!loaded.exists) {
      log.warn(
        `Skipping ${framework.name}. Missing template ${framework.templateTsconfigPath}`
      )
      continue
    }
    valid.push({
      ...framework,
      templateConfig: loaded.config,
    })
  }
  return valid
}
