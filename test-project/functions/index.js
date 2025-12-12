// src/action/index.ts
"no action";
async function onRequestGet(params) {
  return new Response("Hello from Cloudflare Pages Function!", {
    headers: { "content-type": "text/plain" }
  });
}
export {
  onRequestGet
};
