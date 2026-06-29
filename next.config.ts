import type { NextConfig } from "next";
import { APP_BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  basePath: APP_BASE_PATH,
  output: "standalone",
  // The k6 dashboard serves HTML with relative asset paths and is
  // trailing-slash sensitive (`/ui/` -> 200, `/ui` -> 301). Disable Next's
  // automatic trailing-slash redirect so the dashboard proxy can forward the
  // exact path (including the trailing slash) straight through to k6.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: APP_BASE_PATH,
        permanent: false,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
