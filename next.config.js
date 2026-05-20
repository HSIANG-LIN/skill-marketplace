/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/skill-marketplace",
  assetPrefix: "/skill-marketplace",
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
