import { defineConfig } from "vitest/config";

// Pure-Node TypeScript library — no CSS in tests. Without this, vite/vitest
// walks up the directory tree looking for a PostCSS config. The worktree
// happens to live under a parent dir that has an unrelated Tailwind PostCSS
// config (./CLAUDE CODE/postcss.config.mjs) which crashes test startup.
//
// Setting css.postcss with empty plugins skips the directory walk entirely.
export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
});
