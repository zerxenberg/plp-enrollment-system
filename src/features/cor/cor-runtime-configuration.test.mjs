import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

test("Next.js runs PDFKit as an external Node.js package so its built-in AFM fonts resolve", async () => {
  const { default: nextConfig } = await import("../../../next.config.mjs");
  assert.ok(nextConfig.serverExternalPackages?.includes("pdfkit"));
  const pdfkitLocation = require.resolve("pdfkit");
  assert.match(pdfkitLocation, /pdfkit[\\/]js[\\/]pdfkit\.js$/);
  const fonts = [
    "Helvetica.afm",
    "Helvetica-Bold.afm",
    "Times-Bold.afm",
  ];
  for (const font of fonts) {
    assert.ok(
      existsSync(require.resolve(`pdfkit/js/data/${font}`)),
      `${font} must be installed alongside PDFKit for A4 COR rendering`,
    );
  }
});
