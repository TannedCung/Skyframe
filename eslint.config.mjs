// @ts-check
import { fixupConfigRules } from "@eslint/compat";
import pluginNext from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    plugins: {
      "@next/next": pluginNext,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      ...pluginReact.configs.flat?.recommended?.rules,
      ...pluginReactHooks.configs.recommended.rules,
    },
    settings: {
      react: { version: "detect" },
    },
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
);
