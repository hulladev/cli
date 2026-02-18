import type { TsconfigPatchPlan } from "@/types"
import { mkdir } from "node:fs/promises"
import { dirname } from "path"

export async function applyTsconfigPatches(
  patches: TsconfigPatchPlan[]
): Promise<void> {
  for (const patch of patches) {
    await mkdir(dirname(patch.targetPath), { recursive: true })
    await Bun.write(patch.targetPath, patch.afterText)
  }
}
