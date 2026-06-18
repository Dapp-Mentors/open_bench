/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@openbench/agents',
    '@openbench/pipeline',
    '@openbench/runner',
    '@openbench/scoring',
    '@openbench/storage',
    '@openbench/indexd',
    '@openbench/shared',
  ],
  images: {
    remotePatterns: [
      // Google profile images (OAuth)
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
        pathname: '/**',
      },
      // GitHub avatar images
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // Enable MCP server
    mcpServer: true,
  },
}

module.exports = nextConfig
