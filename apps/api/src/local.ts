import app from "./index";

// Rate limiting login kini memakai KV Namespace (LOGIN_IP_RATE_LIMITER &
// LOGIN_USERNAME_RATE_LIMITER) yang disediakan wrangler.local.jsonc saat
// `wrangler dev --local`. Tidak lagi memerlukan shim in-memory.
export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, executionContext);
  },
};
