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
  experimental: {
    // Enable MCP server
    mcpServer: true,
  },
}

module.exports = nextConfig
