import { previewUiHooks, runUiHooks } from "@/modules/ui/shared/hooks"
import { afterEach, expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { UIConfigSchema } from "schemas/ui.schema"

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

test("ordinary post hooks run once, preview file processing is explicit, and quoted paths stay intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-hooks-"))
  dirs.push(root)
  await Bun.write(
    join(root, "hook.mjs"),
    `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
appendFileSync('calls.jsonl', JSON.stringify({ phase:process.env.HULLA_UI_PHASE, operation:process.env.HULLA_UI_OPERATION, files:JSON.parse(process.env.HULLA_UI_FILES), args:process.argv.slice(2) })+'\\n');
for(const file of process.argv.slice(2)) writeFileSync(file,readFileSync(file,'utf8').replaceAll('raw','processed'));
`
  )
  const path = join(root, "button's name.ts")
  await Bun.write(path, "authored")
  const tool = join(root, "node_modules/.bin/hook-tool")
  await Bun.write(tool, '#!/bin/sh\nexec bun hook.mjs "$@"\n')
  await chmod(tool, 0o755)
  const config = UIConfigSchema.parse({ hooks: { post: ["hook-tool"] } })
  expect(
    await previewUiHooks({
      config,
      projectRoot: root,
      files: [{ path, content: "raw" }],
    })
  ).toEqual(new Map())
  expect(await Bun.file(join(root, "calls.jsonl")).exists()).toBe(false)
  await runUiHooks({
    config,
    projectRoot: root,
    phase: "post",
    operation: "add",
    files: [path],
  })
  const first = JSON.parse(
    (await Bun.file(join(root, "calls.jsonl")).text()).trim()
  )
  expect(first).toEqual({
    phase: "post",
    operation: "add",
    files: ["button's name.ts"],
    args: [],
  })
  const preview = UIConfigSchema.parse({
    hooks: { post: [{ command: "bun hook.mjs {files}", preview: true }] },
  })
  const result = await previewUiHooks({
    config: preview,
    projectRoot: root,
    files: [{ path, content: "raw" }],
  })
  expect(result.get(path)).toBe("processed")
  expect(await Bun.file(path).text()).toBe("authored")
  const calls = (await Bun.file(join(root, "calls.jsonl")).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  expect(calls).toHaveLength(2)
  expect(calls[1].phase).toBe("preview")
  expect(calls[1].files).toEqual(calls[1].args)
  expect(calls[1].args[0]).not.toBe("button's name.ts")
})

test("failed hooks stop their sequence and unsafe preview configuration fails before execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-hooks-failure-"))
  dirs.push(root)
  const config = UIConfigSchema.parse({
    hooks: { pre: ["exit 7", "touch should-not-exist"] },
  })
  await expect(
    runUiHooks({
      config,
      projectRoot: root,
      phase: "pre",
      operation: "remove",
      files: [],
    })
  ).rejects.toThrow("UI remove pre hook failed (exit 7)")
  expect(await Bun.file(join(root, "should-not-exist")).exists()).toBe(false)
  expect(() =>
    UIConfigSchema.parse({
      hooks: { post: [{ command: "bun generate", preview: true }] },
    })
  ).toThrow("Preview hooks must contain {files}")
})
