import type { EventContext, FormData } from "@cloudflare/workers-types";

type Metods = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

function parseData(formData: FormData) {
  const propsArray: Array<Array<File> | File | string | {} | FormData> = [];
  const batchsIDs: string[] = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (key.startsWith("FILE_")) propsArray.push(value as unknown as File);
    else if (key.startsWith("FILES_") && !batchsIDs.includes(key)) {
      batchsIDs.push(key);
      propsArray.push(formData.getAll(key) as unknown as Array<File>);
    } else {
      propsArray.push(JSON.parse(decodeURI(value as string)) as {});
    }
  }
  return propsArray;
}

export default async function WrapRequestHandler(
  context: EventContext<any, any, any>,
  methods: Record<Metods, (...args: unknown[]) => unknown>
) {
  const method = context.request.method as Metods;
  if (!(method in methods)) {
    return new Response(`Method ${method} Not Allowed`, { status: 405 });
  }
  const endpoint = methods[method];
  if (typeof endpoint !== "function") {
    return new Response(`Method ${method} Not Implemented`, { status: 501 });
  }

  const parsedData =
    context.request.method === "GET" || context.request.method === "HEAD"
      ? []
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
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", dataType: "json" },
      });
    case "undefined":
      return new Response(null, { status: 204 });
    case "object":
      if (result instanceof Response) {
        result.headers.set("dataType", "response");
        return result;
      } else if (result instanceof Blob) {
        return new Response(result, {
          headers: { dataType: "blob", "Content-Type": result.type },
        });
      } else if (result instanceof File) {
        const response = new Response(result, {
          headers: {
            dataType: "file",
            "Content-Type": result.type,
            fileData: JSON.stringify({
              name: result.name,
              lastModified: result.lastModified,
            }),
          },
        });
        return response;
      } else {
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", dataType: "json" },
        });
      }
    default:
      throw new Error(`Unsupported return type from action: ${typeof result}`);
  }
}
