export type UIInitTaskState = {
  tsConfigPath: string | null
  dependencies: string[]
  devDependencies: string[]
}

export type UISelectedFramework = {
  id: string
  sourceUrl: string
  libraryName: string
  name: string
  codeRoot: string
  templatePath: string
  templateTsconfigPath: string
  outputPath: string
  copyFileDestinations: string[]
}

export type TsconfigPatchPlan = {
  targetPath: string
  beforeText: string
  afterText: string
  mode: "create" | "update"
}

export type UITsconfigSelection = {
  frameworkPaths: Record<string, string>
  rootPath?: string
}

export type UIAddResolvedComponent = {
  componentInput: string
  componentName: string
  sourceUrl: string
  libraryName: string
  frameworkName: string
  codeRoot: string
  sourceRoot: string
  sourceFrameworkRoot: string
  sourceComponentDir: string
  outputPath: string
  copyFilesRoot: string
}

export type UIAddFileOperation = {
  sourcePath: string
  destinationPath: string
  relativePath: string
  destinationExists: boolean
}

export type UIAddSummary = {
  copied: number
  overwritten: number
  skippedExisting: number
  unchangedExisting: number
  missingComponents: string[]
  promptedFrameworkSelections: number
}
