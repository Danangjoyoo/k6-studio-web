import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The k6 dashboard serves HTML with relative asset paths and is
  // trailing-slash sensitive (`/ui/` -> 200, `/ui` -> 301). Disable Next's
  // automatic trailing-slash redirect so the dashboard proxy can forward the
  // exact path (including the trailing slash) straight through to k6.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
