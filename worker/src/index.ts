import { createApp } from "./app";
import { createSupabaseVerifier } from "./auth";
import { PostgrestRpc } from "./db";
import type { Env } from "./env";

const app = createApp({
  rpc: (env, user) => new PostgrestRpc(env, user.token),
  verifyToken: createSupabaseVerifier(),
});

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
