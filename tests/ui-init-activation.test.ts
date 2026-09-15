import { injectGlobalStyleImport } from "@/modules/ui/init/services/global-styles"
import { updateBuildConfig } from "@/modules/ui/init/services/vite"
import { describe, expect, test } from "bun:test"

describe("ui init build activation", () => {
  test("configures Astro through its Vite integration without adding a Vite alias", () => {
    const original = [
      'import { defineConfig } from "astro/config"',
      "",
      "export default defineConfig({})",
      "",
    ].join("\n")

    const first = updateBuildConfig(original, {
      kind: "astro",
      tailwind: true,
    })

    expect(first.content).toContain(
      'import tailwindcss from "@tailwindcss/vite"'
    )
    expect(first.content).toContain("vite:")
    expect(first.content).toContain("plugins: [tailwindcss()]")
    expect(first.content).not.toContain("resolve:")
    expect(
      updateBuildConfig(first.content, { kind: "astro", tailwind: true })
        .changes
    ).toEqual([])
  })

  test("preserves React plugins while adding Tailwind and an absolute source alias", () => {
    const original = [
      'import react from "@vitejs/plugin-react"',
      'import { defineConfig } from "vite"',
      "",
      "export default defineConfig({ plugins: [react()] })",
      "",
    ].join("\n")

    const first = updateBuildConfig(original, {
      aliasTarget: "./src",
      kind: "vite",
      tailwind: true,
    })

    expect(first.content).toContain("plugins: [tailwindcss(), react()]")
    expect(first.content).toContain("  },\n  plugins:")
    expect(first.content).toContain(
      'fileURLToPath(new URL("./src", import.meta.url))'
    )
    expect(
      updateBuildConfig(first.content, {
        aliasTarget: "./src",
        kind: "vite",
        tailwind: true,
      }).changes
    ).toEqual([])
  })

  test("adds only the Vite alias when a registry has no global stylesheet", () => {
    const first = updateBuildConfig(
      'import { defineConfig } from "vite"\nexport default defineConfig({})\n',
      {
        aliasTarget: "./src",
        kind: "vite",
        tailwind: false,
      }
    )

    expect(first.content).toContain('alias: { "@": fileURLToPath')
    expect(first.content).not.toContain("tailwindcss")
  })

  test("imports a global style into Astro frontmatter exactly once", () => {
    const original = '---\nconst title = "Demo"\n---\n<h1>{title}</h1>\n'
    const first = injectGlobalStyleImport(original, "../styles.css", "astro")

    expect(first.startsWith('---\nimport "../styles.css"\n')).toBe(true)
    expect(injectGlobalStyleImport(first, "../styles.css", "astro")).toBe(first)
  })

  test.each(["react", "solid"] as const)(
    "imports a global style into the %s entrypoint exactly once",
    (framework) => {
      const original = 'import { render } from "fixture"\nrender()\n'
      const first = injectGlobalStyleImport(original, "./styles.css", framework)

      expect(first.startsWith('import "./styles.css"\n')).toBe(true)
      expect(injectGlobalStyleImport(first, "./styles.css", framework)).toBe(
        first
      )
    }
  )
})
