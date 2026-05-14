import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // impers uses koffi with native .node binaries — must be external to avoid webpack bundling.
  serverExternalPackages: ["impers", "koffi"],
};

export default nextConfig;
