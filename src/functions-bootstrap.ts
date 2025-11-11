import type {
  EventContext,
  FormData,
  Response as CFResponse,
} from "@cloudflare/workers-types";

type Metods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

function parseData(formData: FormData) {
  const propsArray: Array<Array<File> | File | string | {} | FormData> = [];
  const batchsIDs: string[] = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (key.startsWith("FILE_")) propsArray.push(value as unknown as File);
    else if (key.startsWith("FILES_")) {
      if (batchsIDs.includes(key)) continue;
      batchsIDs.push(key);
      propsArray.push(formData.getAll(key) as unknown as Array<File>);
    } else {
      propsArray.push(JSON.parse(decodeURI(value as string)) as {});
    }
  }
  return propsArray;
}

function paramsFromURL(url: URL): Array<unknown> {
  const params = url.searchParams
    .entries()
    .toArray()
    .map(([_, v]) => v);
  return params.map((param) =>
    JSON.parse(decodeURIComponent(param))
  ) as Array<unknown>;
}

export default async function WrapRequestHandler(
  context: EventContext<any, any, any>,
  methods: Record<Metods, (...args: unknown[]) => unknown>
): Promise<CFResponse> {
  const method = context.request.method as Metods;
  if (!(method in methods)) {
    return new Response(`Method ${method} Not Allowed`, {
      status: 405,
    }) as unknown as CFResponse;
  }
  const endpoint = methods[method];
  if (typeof endpoint !== "function") {
    return new Response(`Method ${method} Not Implemented`, {
      status: 501,
    }) as unknown as CFResponse;
  }

  const parsedData =
    context.request.method === "GET" || context.request.method === "HEAD"
      ? paramsFromURL(new URL(context.request.url))
      : parseData(await context.request.formData());

  const missingProps = endpoint.length - parsedData.length;
  for (let i = 0; i < missingProps; i++) {
    parsedData.push(undefined as any);
  }
  parsedData.push(context);

  const result = await endpoint(...parsedData);
  switch (typeof result) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      const res = new Response(JSON.stringify(result));
      res.headers.set("Content-Type", "application/json");
      res.headers.set("dataType", "json");
      return res as unknown as CFResponse;
    case "undefined":
      return new Response(null, { status: 204 }) as unknown as CFResponse;
    case "object":
      if (result instanceof Response) {
        result.headers.set("dataType", "response");
        return result as unknown as CFResponse;
      } else if (result instanceof Blob) {
        const res = new Response(await result.arrayBuffer());
        res.headers.set("dataType", "blob");
        res.headers.set("Content-Type", result.type);
        return res as unknown as CFResponse;
      } else if (result instanceof File) {
        const res = new Response(await result.arrayBuffer());
        res.headers.set("dataType", "file");
        res.headers.set("Content-Type", result.type);
        res.headers.set(
          "fileData",
          JSON.stringify({
            name: result.name,
            lastModified: result.lastModified,
          })
        );
        return res as unknown as CFResponse;
      } else {
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", dataType: "json" },
        }) as unknown as CFResponse;
      }
    default:
      throw new Error(`Unsupported return type from action: ${typeof result}`);
  }
}
