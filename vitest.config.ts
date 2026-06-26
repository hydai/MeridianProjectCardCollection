import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Read D1 migrations on the Node side and hand them to the Workers runtime as a
// binding; the setup file applies them to the test database before each file.
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      isolatedStorage: true,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
    setupFiles: ["./test/worker/apply-migrations.ts"],
  },
});
