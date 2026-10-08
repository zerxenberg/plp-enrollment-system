import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ignores: ["src/components/ui/AppIcon.js"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "lucide-react", message: "Use AppIcon and its verified ICON_REGISTRY instead of direct icon imports." }],
        patterns: [{ group: ["react-icons", "react-icons/*", "@heroicons/*", "@fortawesome/*"], message: "The project uses the shared Lucide AppIcon registry." }],
      }],
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.name='svg']",
        message: "Do not draw custom SVG icons. Add an official Lucide icon to AppIcon's registry.",
      }],
    },
  },
]);

export default eslintConfig;
