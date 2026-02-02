import { cwd } from "process"
import { findFiles, readJsonFile, resolveAbsolute } from "./bunUtils"
import type { PackageJson } from "./getPackageFiles"

export type Framework =
  | "react"
  | "vue"
  | "svelte"
  | "solid"
  | "astro"
  | "angular"
  | "preact"
  | "qwik"
  | "next"
  | "nuxt"
  | "remix"
  | "sveltekit"
  | "solidstart"
  | "ember"
  | "lit"
  | "stencil"
  | "riot"
  | "mithril"
  | "inferno"
  | "hyperapp"
  | "alpine"
  | "vanilla"

export type FrameworkDetection = {
  framework: Framework
  packageJsonPath: string
  dependency: string
  version: string
}

export type FrameworkDetectionResult = {
  detections: FrameworkDetection[]
  packageJsons: Map<string, PackageJson>
}

/**
 * Detects which frameworks are being used in a project based on package.json dependencies.
 * Supports monorepos by checking workspace packages.
 *
 * @param dir - The directory to check (typically the current working directory)
 * @returns An array of detected frameworks
 */
export async function detectFramework(dir: string): Promise<Framework[]> {
  const { detections } = await detectFrameworkDetailed(dir)
  return Array.from(new Set(detections.map((d) => d.framework)))
}

/**
 * Detects which frameworks are being used with detailed information about where they were detected.
 * Supports monorepos by checking workspace packages.
 *
 * @param dir - The directory to check (typically the current working directory)
 * @returns Framework detections and a map of all read package.json contents
 */
export async function detectFrameworkDetailed(
  dir: string = cwd()
): Promise<FrameworkDetectionResult> {
  const detections: FrameworkDetection[] = []
  const packageJsons = new Map<string, PackageJson>()

  // Get all package.json files (root + workspaces if monorepo)
  const packageJsonFiles = await getAllPackageJsonFiles(dir)

  // Check each package.json for frameworks
  for (const packageJsonPath of packageJsonFiles) {
    const packageJson = await readJsonFile<PackageJson>(packageJsonPath)
    if (!packageJson) continue

    // Store the package.json content for reuse
    packageJsons.set(packageJsonPath, packageJson)

    const frameworkDetections = detectFrameworksFromPackageJsonDetailed(
      packageJson,
      packageJsonPath,
      dir
    )
    detections.push(...frameworkDetections)
  }

  return { detections, packageJsons }
}

/**
 * Gets all package.json files including workspace packages in monorepos
 */
async function getAllPackageJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const rootPackageJson = resolveAbsolute(dir, "package.json")

  // Check if root package.json exists
  const rootPkg = await readJsonFile<PackageJson>(rootPackageJson)
  if (rootPkg) {
    files.push(rootPackageJson)
  }

  // Collect workspace patterns from all possible sources
  const workspacePatterns = new Set<string>()

  // 1. Check package.json workspaces (npm/yarn/pnpm/bun)
  if (rootPkg) {
    const pkgWorkspaces = getWorkspacePaths(rootPkg)
    pkgWorkspaces.forEach((w) => workspacePatterns.add(w))
  }

  // 2. Check pnpm-workspace.yaml
  const pnpmWorkspace = await getPnpmWorkspacePaths(dir)
  pnpmWorkspace.forEach((w) => workspacePatterns.add(w))

  // 3. Check deno.json / deno.jsonc
  const denoWorkspaces = await getDenoWorkspacePaths(dir)
  denoWorkspaces.forEach((w) => workspacePatterns.add(w))

  // 4. Check bunfig.toml (Bun workspaces)
  const bunWorkspaces = await getBunWorkspacePaths(dir)
  bunWorkspaces.forEach((w) => workspacePatterns.add(w))

  // 5. Check nx.json (Nx workspaces)
  const nxWorkspaces = await getNxWorkspacePaths(dir)
  nxWorkspaces.forEach((w) => workspacePatterns.add(w))

  // 6. Check lerna.json (Lerna workspaces)
  const lernaWorkspaces = await getLernaWorkspacePaths(dir)
  lernaWorkspaces.forEach((w) => workspacePatterns.add(w))

  // Find all package.json files in workspace directories
  for (const workspacePattern of workspacePatterns) {
    try {
      // Convert workspace pattern to glob pattern
      // Handle patterns like "packages/*", "apps/*", "packages/**", etc.
      let globPattern: string
      if (workspacePattern.endsWith("/*")) {
        globPattern = `${workspacePattern}/package.json`
      } else if (workspacePattern.includes("*")) {
        globPattern = `${workspacePattern}/package.json`
      } else {
        globPattern = `${workspacePattern}/**/package.json`
      }

      const workspaceFiles = await findFiles(globPattern, dir)
      files.push(...workspaceFiles)
    } catch {
      // Ignore invalid patterns
    }
  }

  return files
}

/**
 * Extracts workspace paths from package.json
 * Supports npm/pnpm workspaces and yarn workspaces
 */
function getWorkspacePaths(packageJson: PackageJson): string[] {
  const workspaces: string[] = []

  // npm/pnpm workspaces (array or object with packages)
  if (Array.isArray(packageJson.workspaces)) {
    workspaces.push(...packageJson.workspaces)
  } else if (
    packageJson.workspaces &&
    typeof packageJson.workspaces === "object" &&
    Array.isArray(packageJson.workspaces.packages)
  ) {
    workspaces.push(...packageJson.workspaces.packages)
  }

  return workspaces
}

/**
 * Extracts workspace paths from pnpm-workspace.yaml
 */
async function getPnpmWorkspacePaths(dir: string): Promise<string[]> {
  const workspaceFile = Bun.file(resolveAbsolute(dir, "pnpm-workspace.yaml"))
  if (!(await workspaceFile.exists())) {
    return []
  }

  try {
    const text = await workspaceFile.text()
    const yaml = Bun.YAML.parse(text)
    if (yaml && typeof yaml === "object" && "packages" in yaml) {
      const packages = yaml.packages
      if (Array.isArray(packages)) {
        return packages.filter(
          (p: unknown): p is string => typeof p === "string"
        )
      }
    }
  } catch {
    // Ignore parse errors
  }

  return []
}

/**
 * Extracts workspace paths from deno.json or deno.jsonc
 */
async function getDenoWorkspacePaths(dir: string): Promise<string[]> {
  const denoJson = resolveAbsolute(dir, "deno.json")
  const denoJsonc = resolveAbsolute(dir, "deno.jsonc")

  for (const path of [denoJson, denoJsonc]) {
    const file = Bun.file(path)
    if (await file.exists()) {
      try {
        // Use text + JSON.parse for .json, strip comments for .jsonc
        const text = await file.text()
        const jsonText = path.endsWith(".jsonc")
          ? stripJsonComments(text)
          : text
        const config = JSON.parse(jsonText) as {
          workspace?: unknown[]
        } | null
        if (
          config &&
          typeof config === "object" &&
          "workspace" in config &&
          Array.isArray(config.workspace)
        ) {
          return config.workspace.filter(
            (w: unknown): w is string => typeof w === "string"
          )
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return []
}

/**
 * Strips single-line (//) and multi-line comments from JSONC
 */
function stripJsonComments(text: string): string {
  let result = ""
  let i = 0
  let inString = false
  let stringChar = ""

  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]

    // Handle string state
    if (inString) {
      result += char
      if (char === "\\" && i + 1 < text.length) {
        result += next
        i += 2
        continue
      }
      if (char === stringChar) {
        inString = false
      }
      i++
      continue
    }

    // Check for string start
    if (char === '"' || char === "'") {
      inString = true
      stringChar = char
      result += char
      i++
      continue
    }

    // Check for single-line comment
    if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++
      }
      continue
    }

    // Check for multi-line comment
    if (char === "/" && next === "*") {
      i += 2
      while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) {
        i++
      }
      i += 2
      continue
    }

    result += char
    i++
  }

  return result
}

/**
 * Extracts workspace paths from bunfig.toml
 */
async function getBunWorkspacePaths(dir: string): Promise<string[]> {
  const bunfigFile = Bun.file(resolveAbsolute(dir, "bunfig.toml"))
  if (!(await bunfigFile.exists())) {
    return []
  }

  try {
    const text = await bunfigFile.text()
    const toml = Bun.TOML.parse(text)
    if (
      toml &&
      typeof toml === "object" &&
      "workspace" in toml &&
      Array.isArray(toml.workspace)
    ) {
      return (toml.workspace as unknown[]).filter(
        (w): w is string => typeof w === "string"
      )
    }
  } catch {
    // Ignore parse errors
  }

  return []
}

/**
 * Extracts workspace paths from nx.json
 */
async function getNxWorkspacePaths(dir: string): Promise<string[]> {
  const nxJson = resolveAbsolute(dir, "nx.json")
  const file = Bun.file(nxJson)
  if (!(await file.exists())) {
    return []
  }

  try {
    const config = await file.json()
    if (config && typeof config === "object" && "projects" in config) {
      const projects = config.projects
      if (Array.isArray(projects)) {
        // Nx projects can be an array of strings or an object
        return projects.filter(
          (p: unknown): p is string => typeof p === "string"
        )
      } else if (projects && typeof projects === "object") {
        // Nx projects can also be an object mapping project names to paths
        return Object.values(projects).filter(
          (p: unknown): p is string => typeof p === "string"
        )
      }
    }
  } catch {
    // Ignore parse errors
  }

  return []
}

/**
 * Extracts workspace paths from lerna.json
 */
async function getLernaWorkspacePaths(dir: string): Promise<string[]> {
  const lernaJson = resolveAbsolute(dir, "lerna.json")
  const file = Bun.file(lernaJson)
  if (!(await file.exists())) {
    return []
  }

  try {
    const config = (await file.json()) as {
      packages?: unknown[]
    } | null
    if (
      config &&
      typeof config === "object" &&
      "packages" in config &&
      Array.isArray(config.packages)
    ) {
      return config.packages.filter(
        (p: unknown): p is string => typeof p === "string"
      )
    }
  } catch {
    // Ignore parse errors
  }

  return []
}

/**
 * Detects frameworks from a single package.json file with detailed information
 */
function detectFrameworksFromPackageJsonDetailed(
  packageJson: PackageJson,
  packageJsonPath: string,
  rootDir: string
): FrameworkDetection[] {
  const detected: FrameworkDetection[] = []

  // Combine dependencies and devDependencies for checking
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  if (!allDependencies || Object.keys(allDependencies).length === 0) {
    return detected
  }

  // Comprehensive framework detection patterns
  const frameworkPatterns: Array<{ framework: Framework; patterns: string[] }> =
    [
      // React ecosystem
      {
        framework: "react",
        patterns: ["react"],
      },
      {
        framework: "next",
        patterns: ["next"],
      },
      {
        framework: "remix",
        patterns: ["@remix-run/react", "@remix-run/node"],
      },
      {
        framework: "preact",
        patterns: ["preact"],
      },
      // Vue ecosystem
      {
        framework: "vue",
        patterns: ["vue"],
      },
      {
        framework: "nuxt",
        patterns: ["nuxt", "nuxt3"],
      },
      // Svelte ecosystem
      {
        framework: "svelte",
        patterns: ["svelte"],
      },
      {
        framework: "sveltekit",
        patterns: ["@sveltejs/kit"],
      },
      // Solid ecosystem
      {
        framework: "solid",
        patterns: ["solid-js"],
      },
      {
        framework: "solidstart",
        patterns: ["solid-start"],
      },
      // Meta frameworks
      {
        framework: "astro",
        patterns: ["astro"],
      },
      // Angular
      {
        framework: "angular",
        patterns: ["@angular/core"],
      },
      // Ember
      {
        framework: "ember",
        patterns: ["ember-source"],
      },
      // Web components / Lit
      {
        framework: "lit",
        patterns: ["lit", "lit-element"],
      },
      {
        framework: "stencil",
        patterns: ["@stencil/core"],
      },
      // Qwik
      {
        framework: "qwik",
        patterns: ["@builder.io/qwik"],
      },
      // Other frameworks
      {
        framework: "riot",
        patterns: ["riot"],
      },
      {
        framework: "mithril",
        patterns: ["mithril"],
      },
      {
        framework: "inferno",
        patterns: ["inferno"],
      },
      {
        framework: "hyperapp",
        patterns: ["hyperapp"],
      },
      {
        framework: "alpine",
        patterns: ["alpinejs"],
      },
      // Vanilla JS (no framework dependencies)
      // Note: This is detected separately if no other frameworks are found
    ]

  // Check each framework pattern
  for (const { framework, patterns } of frameworkPatterns) {
    const matchedPattern = patterns.find(
      (pattern) => pattern in allDependencies
    )
    if (matchedPattern) {
      // Get relative path from root directory
      let relativePath = "package.json"
      if (rootDir && packageJsonPath.startsWith(rootDir)) {
        const relative = packageJsonPath
          .slice(rootDir.length)
          .replace(/^\//, "")
        if (relative && relative !== "package.json") {
          relativePath = relative
        }
      }

      detected.push({
        framework,
        packageJsonPath: relativePath,
        dependency: matchedPattern,
        version: allDependencies[matchedPattern] ?? "unknown",
      })
    }
  }

  return detected
}
