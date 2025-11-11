import type { EventContext } from "@cloudflare/workers-types";
import Wrapper from "../functions-bootstrap";

type METHODS = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

declare global {
  var METHODS: Record<METHODS, (...args: unknown[]) => unknown>;
}

globalThis.METHODS ??= {
  // @ts-ignore
  GET: typeof GET === "function" ? GET : undefined,
  // @ts-ignore
  POST: typeof POST === "function" ? POST : undefined,
  // @ts-ignore
  PUT: typeof PUT === "function" ? PUT : undefined,
  // @ts-ignore
  DELETE: typeof DELETE === "function" ? DELETE : undefined,
  // @ts-ignore
  PATCH: typeof PATCH === "function" ? PATCH : undefined,
  // @ts-ignore
  HEAD: typeof HEAD === "function" ? HEAD : undefined,
  // @ts-ignore
  OPTIONS: typeof OPTIONS === "function" ? OPTIONS : undefined,
};

export function onRequest(
  context: EventContext<any, any, any>
): Promise<Response> {
  const method = context.request.method as METHODS;
  if (!globalThis.METHODS || !globalThis.METHODS[method]) {
    return Promise.resolve(new Response("Method Not Allowed", { status: 405 }));
  }
  return Wrapper(context, globalThis.METHODS);
}
