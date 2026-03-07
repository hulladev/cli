// @ts-check

import eslint from "@eslint/js"
import prettier from "eslint-plugin-prettier/recommended"
import tseslint from "typescript-eslint"

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".hulla/**",
      ".changeset/**",
      "sandbox/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@clack/prompts",
              message:
                "Direct imports from @clack/prompts are only allowed in src/prompts directory. Use the wrapper functions from src/prompts instead.",
            },
            {
              name: "picocolors",
              message:
                "Direct imports from picocolors are only allowed in src/decorators directory. Use the wrapper functions from src/decorators instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/prompts/**/*", "src/terminal/prompts/**/*"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  {
    files: ["src/decorators/**/*", "src/terminal/format/**/*"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  }
)
