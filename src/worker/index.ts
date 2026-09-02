import { app } from "./app";

// Wrangler generates the binding contract in worker-configuration.d.ts.
export type Env = Cloudflare.Env;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
