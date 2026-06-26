import { applyD1Migrations, env } from "cloudflare:test";

// Apply all migrations (schema + seed) to the isolated test database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
