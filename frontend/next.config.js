/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@openbench/agents",
    "@openbench/pipeline",
    "@openbench/runner",
    "@openbench/scoring",
    "@openbench/storage",
    "@openbench/indexd",
    "@openbench/shared",
  ],
};

module.exports = nextConfig;
