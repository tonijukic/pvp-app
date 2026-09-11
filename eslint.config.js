import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Strict project rules. Layers, in order:
//   1. ESLint + typescript-eslint recommended (correctness baseline)
//   2. project code-smell limits (depth, size, complexity, console, ==)
//   3. React hooks rules for the client
//   4. eslint-config-prettier last → turns off purely-stylistic rules so
//      Prettier owns formatting and the two never fight.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "client/src/components/ui/**", // generated shadcn components
      "*.config.{js,ts}",
      "script/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // --- correctness / safety ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // --- code smells (mirror .claude coding-style limits) ---
      "max-depth": ["error", 4],
      complexity: ["warn", 15],
      "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 4],
    },
  },

  // Client (browser + React)
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Server (Node)
  {
    files: ["server/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // Server bootstrap legitimately logs to the console.
  {
    files: ["server/index.ts"],
    rules: { "no-console": "off" },
  },

  // Tests: relax size/console for fixtures and assertions.
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off", "no-console": "off" },
  },

  prettier,
);
