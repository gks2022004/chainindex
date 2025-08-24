/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Use a custom build directory to avoid OneDrive locking the default .next path
  distDir: '.next-dev',
}

module.exports = nextConfig
