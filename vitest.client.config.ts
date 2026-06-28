import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ["test/client/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/client/setup.ts"],
  },
});
