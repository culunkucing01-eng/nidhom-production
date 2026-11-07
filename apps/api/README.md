```txt
npm install
npm run dev
```

Local development uses `wrangler.local.jsonc` and a separate local D1 identity with no
production database ID. It intentionally has no
Cloudflare Rate Limiting bindings, so login requests fail closed with HTTP 503 unless a
local-only Worker entrypoint supplies in-memory mock limiters. The mock enforces 30/IP/60s
and 10/username/60s and is not imported by the production entrypoint. Start the local Worker
with `npm run dev`, then in another terminal run `npm run test:local-auth`. The test uses
only Wrangler `--local` D1, creates a temporary user, and removes it afterward. Do not copy
namespace IDs into the local config.

## Production rate-limit configuration

`wrangler.jsonc` is the production deployment config. Its rate-limit namespace IDs are
deliberate non-numeric placeholders. Deployments must use `npm run deploy` with no
additional arguments. The script validates first and issues a one-time approval token
required by Wrangler's production build hook. Direct Wrangler deploy commands using either
repository config are rejected without that token; the local config build hook permits only
`wrangler dev`.

Before deploying:

1. In the intended Cloudflare account, create or select two distinct Rate Limiting
   namespaces and verify their IDs there. Do not use example IDs, local values, or IDs
   copied from another account.
2. Replace the two `namespace_id` placeholder strings in `wrangler.jsonc` with those
   verified positive integer IDs. Keep the limiter names and thresholds unchanged:
   30/IP/60 seconds and 10/username/60 seconds.
3. Explicitly confirm that verification in the deployment environment by setting
   `NIDHOM_RATE_LIMIT_IDS_VERIFIED=I_VERIFIED_THESE_IN_CLOUDFLARE`.
4. Run `npm run deploy`. The script validates the IDs, uniqueness, binding names,
   thresholds, D1 target, and production entrypoint before invoking Wrangler.

Run `npm run test:deployment-guards` to verify placeholder rejection, argument rejection,
local/production entrypoint separation, and bundle isolation without deploying.

These repository guards do not control a user who deliberately invokes Wrangler with an
external config that has no guard, edits the configs/scripts, or manually forges the
ephemeral approval protocol. Restrict Cloudflare credentials and production deployment
permissions to the approved operator/CI path; local code cannot cryptographically prevent
the owner of deployment credentials from bypassing it.

The script cannot independently verify ownership or existence of a namespace without
accessing the Cloudflare account. The confirmation above is an operator attestation, not
an API verification. Never run the deploy script with placeholder or unverified IDs.

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
