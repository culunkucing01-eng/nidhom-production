import app from "./index";
import { createLocalRateLimiter } from "./local/rate-limit";

const ipRateLimiter = createLocalRateLimiter(30, 60_000);
const usernameRateLimiter = createLocalRateLimiter(10, 60_000);

type LocalBindings = Omit<
  CloudflareBindings,
  "LOGIN_IP_RATE_LIMITER" | "LOGIN_USERNAME_RATE_LIMITER"
>;

export default {
  async fetch(
    request: Request,
    env: LocalBindings,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(
      request,
      {
        ...env,
        LOGIN_IP_RATE_LIMITER: ipRateLimiter,
        LOGIN_USERNAME_RATE_LIMITER: usernameRateLimiter,
      },
      executionContext,
    );
  },
};
