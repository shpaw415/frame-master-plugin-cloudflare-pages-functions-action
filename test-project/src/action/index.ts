"no action";

import type { EventContext } from "@cloudflare/workers-types";

export async function onRequestGet(params: EventContext<Env, any, any>) {
  return new Response("Hello from Cloudflare Pages Function!", {
    headers: { "content-type": "text/plain" },
  });
}
