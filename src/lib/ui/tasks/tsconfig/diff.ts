import { d } from "@/decorators"
import type { TsconfigPatchPlan } from "@/types"
import { relative } from "path"

type DiffOperation =
  | { type: "context"; line: string }
  | { type: "remove"; line: string }
  | { type: "add"; line: string }

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/")
}

function trimTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text
}

function buildLineOperations(
  beforeLines: string[],
  afterLines: string[]
): DiffOperation[] {
  const m = beforeLines.length
  const n = afterLines.length

  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const ops: DiffOperation[] = []
  let i = 0
  let j = 0

  while (i < m && j < n) {
    if (beforeLines[i] === afterLines[j]) {
      ops.push({ type: "context", line: beforeLines[i] })
      i++
      j++
      continue
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", line: beforeLines[i] })
      i++
      continue
    }

    ops.push({ type: "add", line: afterLines[j] })
    j++
  }

  while (i < m) {
    ops.push({ type: "remove", line: beforeLines[i] })
    i++
  }

  while (j < n) {
    ops.push({ type: "add", line: afterLines[j] })
    j++
  }

  return ops
}

function formatHunkRange(start: number, count: number): string {
  return `${start},${count}`
}

function renderOp(op: DiffOperation): string {
  if (op.type === "remove") {
    return d.error(`-${op.line}`)
  }
  if (op.type === "add") {
    return d.success(`+${op.line}`)
  }
  return ` ${op.line}`
}

export function createUnifiedDiff(
  patch: TsconfigPatchPlan,
  cwd: string
): string {
  const relativePath = normalizePath(
    relative(cwd, patch.targetPath) || patch.targetPath
  )
  const fromPath = patch.mode === "create" ? "/dev/null" : `a/${relativePath}`
  const toPath = `b/${relativePath}`

  const before = trimTrailingNewline(patch.beforeText)
  const after = trimTrailingNewline(patch.afterText)

  const beforeLines = before.length > 0 ? before.split("\n") : []
  const afterLines = after.length > 0 ? after.split("\n") : []
  const ops = buildLineOperations(beforeLines, afterLines)

  const beforeStart = beforeLines.length === 0 ? 0 : 1
  const afterStart = afterLines.length === 0 ? 0 : 1

  const lines = [
    `--- ${fromPath}`,
    `+++ ${toPath}`,
    `@@ -${formatHunkRange(beforeStart, beforeLines.length)} +${formatHunkRange(afterStart, afterLines.length)} @@`,
    ...ops.map(renderOp),
  ]

  return lines.join("\n")
}
