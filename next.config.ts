import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Parent-facing magic-link forms -- never indexable, never cached
        // by a crawler that might stumble on a leaked/shared URL.
        source: "/forms/fill/:token*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Kiosk device links -- same reasoning as forms/fill.
        source: "/kiosk/:deviceToken*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
