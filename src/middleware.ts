import { defineMiddleware } from "astro:middleware";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  // Other sites may not frame these pages; the home's 3D boot frames the
  // page itself on the monitor before handing over to it.
  "X-Frame-Options": "SAMEORIGIN",
} as const;

const EDU_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cool.rgo.pt",
  "connect-src 'self' https://cool.rgo.pt",
  "img-src 'self' data: https://i.ytimg.com",
  "frame-src https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (context.url.pathname === "/edu" || context.url.pathname === "/edu/") {
    headers.set("Content-Security-Policy", EDU_CONTENT_SECURITY_POLICY);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
