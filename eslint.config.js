import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/", "**/.next/", "**/.turbo/"],
  },
  {
    files: ["packages/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules },
  },
);
