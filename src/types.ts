/**
 * Compatibility shim during the restructure.
 * Prefer importing from scoped type modules directly.
 */
export type {
  CommandContext,
  CommandModule,
  CommandOutcome,
  CommandSuccess,
  HullaConfig,
  PackageManager,
  ParserResult,
  RawHullaConfig,
  SubcommandModule,
  TerminalApi,
} from "@/app/types"
export type {
  InitScriptManagerProps,
  InitUserAction,
} from "@/modules/init/types"
export type {
  TsconfigPatchPlan,
  UIAddFileOperation,
  UIAddResolvedComponent,
  UIAddSummary,
  UIInitTaskState,
  UISelectedFramework,
  UITsconfigSelection,
} from "@/modules/ui/types"
