import type {
  PagesFunction,
  Response as CFResponse,
} from "@cloudflare/workers-types";
import Wrapper from "../functions-bootstrap";

type METHODS = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export const onRequest: PagesFunction = async (context) => {
  const method = context.request.method as METHODS;

  const options = {
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

  if (!options[method]) {
    return new Response("Method Not Allowed", {
      status: 405,
    }) as unknown as CFResponse;
  }
  return await Wrapper(context, options);
};
