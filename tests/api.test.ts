import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  assertFrameworkCompatibility,
  createApiInitPlan,
} from "../src/modules/api/run"

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe("hulla api init", () => {
  test("detects Next and Drizzle and plans non-destructive scaffolding", async () => {
    const root = await mkdtemp(join(tmpdir(), "hulla-api-init-"))
    temporary.push(root)
    await write(
      root,
      "package.json",
      JSON.stringify({
        dependencies: { next: "latest", "drizzle-orm": "latest" },
      })
    )
    await write(
      root,
      "drizzle.config.ts",
      "export default { dialect: 'sqlite', schema: './src/db/schema/**/*.ts' }\n"
    )
    await write(root, "src/db/client.ts", "export const db = {}\n")

    const plan = await createApiInitPlan(root)

    expect(plan.framework).toBe("next")
    expect(plan.files.map((file) => file.path)).toEqual([
      join(root, "api.config.ts"),
      join(root, "src/api/api.ts"),
      join(root, "src/api/health.router.ts"),
      join(root, "src/api/hulla.ts"),
      join(root, "app/api/[[...hulla]]/route.ts"),
    ])
    expect(plan.files[3]?.content).toContain("export const handler")
    expect(plan.files[1]?.content).toContain("createApi")
    expect(plan.files[1]?.content).not.toContain("import { init }")
    expect(plan.files[0]?.content).not.toContain("fromDrizzle")
    expect(plan.files[4]?.content).toContain("export const GET = handler.fetch")
    expect(plan.files[4]?.content).toContain(
      "export const OPTIONS = handler.fetch"
    )
  })

  test("does not plan overwrites", async () => {
    const root = await mkdtemp(join(tmpdir(), "hulla-api-init-"))
    temporary.push(root)
    await write(
      root,
      "package.json",
      JSON.stringify({ dependencies: { "drizzle-orm": "latest" } })
    )
    await write(root, "drizzle.config.ts", "export default {}\n")
    await write(root, "src/db.ts", "export const db = {}\n")
    await write(root, "api.config.ts", "export default {}\n")
    await write(root, "src/api/hulla.ts", "export const handler = {}\n")

    const plan = await createApiInitPlan(root)
    expect(plan.files.some((file) => file.path.endsWith("api.config.ts"))).toBe(
      false
    )
    expect(
      plan.files.some((file) => file.path.endsWith("src/api/hulla.ts"))
    ).toBe(false)
  })

  test("only enables bulk Drizzle routes after explicit opt-in", async () => {
    const root = await project({})
    const plan = await createApiInitPlan(root, { bulkDrizzleRoutes: true })

    expect(plan.files[0]?.content).toContain("fromDrizzle({ routes: 'all' })")
    expect(plan.files[3]?.content).toContain("createDrizzleRouters({ api })")
  })

  test("scaffolds a server-only Bun API without Drizzle", async () => {
    const root = await mkdtemp(join(tmpdir(), "hulla-api-init-"))
    temporary.push(root)
    await write(root, "package.json", JSON.stringify({ dependencies: {} }))

    const plan = await createApiInitPlan(root)

    expect(plan.framework).toBe("bun")
    expect(plan.files[0]?.content).toContain("routers:")
    expect(plan.files[1]?.content).toContain("createApi()")
    expect(plan.files[1]?.content).not.toContain("drizzlePlugin")
    expect(plan.files[2]?.path).toEndWith("health.router.ts")
  })

  for (const fixture of [
    { framework: "hono", dependency: "hono", expected: "new Hono()" },
    { framework: "elysia", dependency: "elysia", expected: "new Elysia()" },
    {
      framework: "express",
      dependency: "express",
      expected: "createExpressMiddleware",
    },
    {
      framework: "nest",
      dependency: "@nestjs/common",
      expected: "createNestMiddleware",
    },
  ] as const) {
    test(`scaffolds the ${fixture.framework} transport`, async () => {
      const root = await project({ [fixture.dependency]: "latest" })
      const plan = await createApiInitPlan(root)
      expect(plan.framework).toBe(fixture.framework)
      expect(plan.files.at(-1)?.content).toContain(fixture.expected)
    })
  }

  test("scaffolds Fetch handlers for Bun and Deno", async () => {
    const bunRoot = await project({})
    const bunPlan = await createApiInitPlan(bunRoot)
    expect(bunPlan.framework).toBe("bun")
    expect(bunPlan.files.at(-1)?.content).toContain("Bun.serve")

    const denoRoot = await project({})
    await write(denoRoot, "deno.json", "{}\n")
    const denoPlan = await createApiInitPlan(denoRoot)
    expect(denoPlan.framework).toBe("deno")
    expect(denoPlan.files.at(-1)?.content).toContain("Deno.serve")
  })

  test("rejects QUERY contracts for Next App Router", async () => {
    const root = await project({ next: "latest" })
    const contract = join(root, "generated/routes.contract.json")
    await write(
      root,
      "generated/routes.contract.json",
      JSON.stringify({ routes: [{ method: "QUERY", path: "/todos" }] })
    )

    await expect(
      assertFrameworkCompatibility(root, {
        sources: [{ outputs: { contract } }],
      })
    ).rejects.toThrow("cannot expose HTTP QUERY")
  })
})

async function project(dependencies: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "hulla-api-init-"))
  temporary.push(root)
  await write(
    root,
    "package.json",
    JSON.stringify({
      dependencies: { "drizzle-orm": "latest", ...dependencies },
    })
  )
  await write(root, "drizzle.config.ts", "export default {}\n")
  await write(root, "src/db.ts", "export const db = {}\n")
  return root
}

async function write(root: string, path: string, content: string) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}
