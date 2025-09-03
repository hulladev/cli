// @ts-check

import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import prettier from "eslint-plugin-prettier/recommended"

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@clack/prompts",
              message:
                "Direct imports from @clack/prompts are only allowed in src/prompts directory. Use the wrapper functions from src/prompts instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/prompts/**/*"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  }
)
