import type { NextConfig } from "next";

const isGitHubPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";
const repositoryName = "ecg-math-simulation";

const nextConfig: NextConfig = {
  // Static export so the app can be served from GitHub Pages
  output: "export",
  // Use repo prefix only when deploying to GitHub Pages
  assetPrefix: isGitHubPages ? `/${repositoryName}/` : undefined,
  basePath: isGitHubPages ? `/${repositoryName}` : undefined,
  trailingSlash: true,
};

export default nextConfig;
