import type { HullaConfig, ParserResult } from "@/app/types"
import type { UIAddResolvedComponent } from "@/modules/ui/types"

export type AliasRewriteMapping = {
  from: string
  to: string
}

export type CreateUiAddTaskInput = {
  config: HullaConfig
  parserResult: ParserResult
  result: ParserResult["commands"]["ui"]["commands"]["add"]
}

export type FrameworkInstall = {
  sourceUrl: string
  libraryName: string
  frameworkName: string
  templatePath: string
  outputPath: string
  codeRoot: string
  copyFilesRoot: string
  sourceRoot: string
  sourceFrameworkRoot: string
  componentsByLowerName: Map<string, string>
}

export type CachedSource = {
  rootDir: string
  commit: string | undefined
  branch: string | undefined
}

export type CopyFileEntry = {
  src: string
  dest?: string
  required?: boolean
}

export type UILibraryWithCopyFiles = {
  copyFiles?: {
    shared?: CopyFileEntry[]
  } & Record<string, CopyFileEntry[] | undefined>
}

export type UIInstallConfig = Awaited<
  ReturnType<(typeof import("@/modules/ui/config"))["readUIConfig"]>
>["data"]["installs"]

export type FrameworkSelection = Pick<
  UIAddResolvedComponent,
  | "sourceRoot"
  | "sourceFrameworkRoot"
  | "libraryName"
  | "frameworkName"
  | "copyFilesRoot"
>
