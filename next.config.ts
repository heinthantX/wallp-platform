import type { NextConfig } from "next";
import path from "path";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: path.resolve(__dirname),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
