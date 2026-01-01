import type { NextConfig } from "next";

const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";
const basePathName = process.env.NEXT_PUBLIC_BASE_PATH || "ecg-visualize-graph";

const nextConfig: NextConfig = {
  // Static export so the app can be served from GitHub Pages
  output: "export",
  // Use repo prefix only when deploying to GitHub Pages
  assetPrefix: isGitHubPages ? `/${basePathName}/` : undefined,
  basePath: isGitHubPages ? `/${basePathName}` : undefined,
  trailingSlash: true,
};

export default nextConfig;
