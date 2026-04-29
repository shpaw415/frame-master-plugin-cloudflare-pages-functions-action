import {
  createOnRequest
} from "./../chunk-ytvdsmzg.js";

// src/action/api/index.ts
async function onRequestGet(params) {
  return new Response("Hello from Cloudflare Pages Function!", {
    headers: { "content-type": "text/plain" }
  });
}
var handlers = {
  GET: typeof GET === "function" ? GET : undefined,
  POST: typeof POST === "function" ? POST : undefined,
  PUT: typeof PUT === "function" ? PUT : undefined,
  DELETE: typeof DELETE === "function" ? DELETE : undefined,
  PATCH: typeof PATCH === "function" ? PATCH : undefined,
  HEAD: typeof HEAD === "function" ? HEAD : undefined,
  OPTIONS: typeof OPTIONS === "function" ? OPTIONS : undefined
};
var onRequest = createOnRequest(handlers);
export {
  onRequestGet,
  onRequest
};

//# debugId=A163903C3C989D9D64756E2164756E21
//# sourceMappingURL=./api/index.js.map
