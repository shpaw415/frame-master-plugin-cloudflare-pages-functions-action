// src/action/index.ts
"no action";
async function onRequestGet(params) {
  return new Response("Hello from Cloudflare Pages Function!", {
    headers: { "content-type": "text/plain" }
  });
}
function parseData(formData) {
  let propsArray = [], batchsIDs = [];
  for (let [key, value] of Array.from(formData.entries()))
    if (key.startsWith("FILE_"))
      propsArray.push(value);
    else if (key.startsWith("FILES_")) {
      if (batchsIDs.includes(key))
        continue;
      batchsIDs.push(key), propsArray.push(formData.getAll(key));
    } else
      propsArray.push(JSON.parse(decodeURI(value)));
  return propsArray;
}
function paramsFromURL(url) {
  return url.searchParams.entries().toArray().map(([_, v]) => v).map((param) => JSON.parse(decodeURIComponent(param)));
}
async function WrapRequestHandler(context, endpoint) {
  if (context.request.headers.get("x-server-action") !== "true")
    return new Response("Not Found", { status: 404 });
  let parsedData = context.request.method === "GET" || context.request.method === "HEAD" ? paramsFromURL(new URL(context.request.url)) : parseData(await context.request.formData()), missingProps = endpoint.length - parsedData.length;
  for (let i = 0;i < missingProps; i++)
    parsedData.push(undefined);
  parsedData.push(context);
  let result = await endpoint(...parsedData);
  switch (typeof result) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      let res = new Response(JSON.stringify(result));
      return res.headers.set("Content-Type", "application/json"), res.headers.set("dataType", "json"), res;
    case "undefined":
      return new Response(null, { status: 204 });
    case "object":
      if (result instanceof Response)
        return result.headers.set("dataType", "response"), result;
      else if (result instanceof Blob) {
        let res2 = new Response(await result.arrayBuffer());
        return res2.headers.set("dataType", "blob"), res2.headers.set("Content-Type", result.type), res2;
      } else if (result instanceof File) {
        let res2 = new Response(await result.arrayBuffer());
        return res2.headers.set("dataType", "file"), res2.headers.set("Content-Type", result.type), res2.headers.set("fileData", JSON.stringify({ name: result.name, lastModified: result.lastModified })), res2;
      } else
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", dataType: "json" } });
    default:
      throw Error(`Unsupported return type from action: ${typeof result}`);
  }
}
var onRequest = async (context) => {
  let method = context.request.method, options = { GET: typeof GET === "function" ? GET : undefined, POST: typeof POST === "function" ? POST : undefined, PUT: typeof PUT === "function" ? PUT : undefined, DELETE: typeof DELETE === "function" ? DELETE : undefined, PATCH: typeof PATCH === "function" ? PATCH : undefined, HEAD: typeof HEAD === "function" ? HEAD : undefined, OPTIONS: typeof OPTIONS === "function" ? OPTIONS : undefined };
  if (!options[method])
    return new Response(`Method "${method}" Not Allowed`, { status: 405 });
  return await WrapRequestHandler(context, options[method]);
};
export {
  onRequestGet,
  onRequest
};
