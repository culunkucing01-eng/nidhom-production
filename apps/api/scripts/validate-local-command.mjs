if (process.env.WRANGLER_COMMAND !== "dev") {
  console.error("Local Wrangler configuration is restricted to wrangler dev.");
  process.exit(1);
}
