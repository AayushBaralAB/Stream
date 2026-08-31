/** @type {import('next').NextConfig} */
// Set NEXT_PUBLIC_BASE_PATH when hosting under a sub-path (e.g. GitHub Pages project repo).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath,
  trailingSlash: true,
  poweredByHeader: false,
  compress: true,
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig