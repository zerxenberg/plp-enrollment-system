/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDFKit loads its built-in AFM font files relative to its installed module.
  // Next/Turbopack bundling rewrites that relative path to C:\ROOT, causing
  // authenticated COR PDF routes to fail at runtime with ENOENT.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
