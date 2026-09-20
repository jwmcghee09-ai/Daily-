import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Third-party code we do not write and will not edit. Chart.js alone
    // accounted for 541 of 580 warnings, which is enough noise to hide a real
    // one — linting a minified bundle tells us nothing either way.
    "public/vendor/**",
    "public/js/**",

    // Electron's entry points are CommonJS by necessity: the main and preload
    // processes load before any ESM loader exists, so `require` is correct
    // there and the no-require-imports rule is not.
    "electron/**",
  ]),
]);

export default eslintConfig;
