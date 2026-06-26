import { app } from "./app";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OWNER_EMAIL: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  // "1" only in local dev (.dev.vars) and tests; never set on the deployed worker.
  ALLOW_INSECURE_ADMIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
