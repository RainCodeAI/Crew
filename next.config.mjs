/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const isProd =
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production";

    const security = [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      // Baseline CSP — Clerk + Convex + Next inline bootstrap.
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.com https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com",
          "font-src 'self' data:",
          "connect-src 'self' https://*.convex.cloud https://*.clerk.accounts.dev https://clerk.com https://api.openai.com wss://*.convex.cloud",
          "frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    // L4: HSTS only in production (avoid local HTTP friction).
    if (isProd) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
