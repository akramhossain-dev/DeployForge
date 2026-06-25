/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// M-1: Remove 'unsafe-eval' in production.
// 'unsafe-eval' is needed by Next.js HMR in development only.
// In production, only 'unsafe-inline' remains (required by Next.js inline script chunks).
// A full nonce-based CSP would remove 'unsafe-inline' too but requires server-side nonce injection.
const scriptSrc = isDev
  ? "'self' 'unsafe-eval' 'unsafe-inline'"
  : "'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  isDev
    ? "connect-src 'self' http://localhost:3001 http://127.0.0.1:3001 ws://localhost:3001 ws://127.0.0.1:3001 https: wss:"
    : "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
