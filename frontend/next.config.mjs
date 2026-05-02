/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for S3 + CloudFront hosting. Only affects `next build`;
  // `next dev` still runs the full dev server with hot reload.
  output: "export",
  // Required when output: 'export' — Next image optimizer needs a server.
  // Patient photos are pre-resized in the seed; logo is small.
  images: {
    unoptimized: true,
  },
  // Generates /path/index.html (not /path.html) — plays nicer with S3 + CloudFront.
  trailingSlash: true,
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
