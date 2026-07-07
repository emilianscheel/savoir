import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the build output (out/) can be deployed to Butterbase
  // frontend hosting (framework: "nextjs-static").
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: __dirname },
};

export default nextConfig;
