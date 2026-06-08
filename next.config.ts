import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 親ディレクトリのlockfileを拾わず、このリポジトリをTurbopackの境界に固定します。
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
