function InitActionData(
  ...props: Array<File | string | string[] | FormData | { [key: string]: any }>
) {
  let currentPropsIndex = 0;
  const formatToFile = () => {
    currentPropsIndex++;
    return `FILE_${currentPropsIndex}`;
  };
  const formatToBatchedFile = () => {
    return `FILES_${currentPropsIndex}`;
  };
  const formatToJson = () => {
    currentPropsIndex++;
    return `JSON_${currentPropsIndex}`;
  };

  const formData = new FormData();

  if (props.length === 0) return formData;
  else if (props.length === 1 && props[0] instanceof FormData) {
    return props[0] as FormData;
  }
  for (const prop of props) {
    if (prop instanceof FormData) {
      throw new Error(
        "only one prop is permitted with a FormData in a Worker Action"
      );
    } else if (prop instanceof File) {
      const id = formatToFile();
      formData.append(id, prop);
    } else if (Array.isArray(prop) && prop.length > 0) {
      if (!(prop[0] instanceof File)) {
        const id = formatToJson();
        formData.append(id, encodeURI(JSON.stringify(prop)));
        continue;
      } else {
        const id = formatToBatchedFile();
        prop.forEach((p) => {
          if (p instanceof File) {
            formData.append(id, p);
          } else {
            throw new Error(
              "only File instances are permitted inside an array of Files in a Worker Action"
            );
          }
        });
      }
    } else {
      const id = formatToJson();
      formData.append(id, encodeURI(JSON.stringify(prop)));
    }
  }
  return formData;
}

async function makeActionRequest(
  props: Array<any>,
  pathname: string,
  method:
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE"
    | "PATCH"
    | "HEAD"
    | "OPTIONS" = "POST"
) {
  if (method === "GET" || method === "HEAD") {
    if (props.length > 0) {
      throw new Error(
        `Cannot send data with ${method} requests in Worker Actions`
      );
    }
  }

  const res = await fetch(pathname, {
    method,
    body: props.length > 0 ? InitActionData(...props) : undefined,
  });
  return await ParseServerActionResponse(res);
}

type ServerActionDataTypeHeader = "json" | "file" | "blob" | "response";

async function ParseServerActionResponse(response: Response) {
  if (!response.ok)
    throw new Error(
      `error when Calling worker action ${response.url}: ${response.statusText}`
    );

  switch (response.headers.get("dataType") as ServerActionDataTypeHeader) {
    case "json":
      const props = ((await response.json()) as { props: any }).props;
      return props;
    case "blob":
      return await response.blob();
    case "file":
      const blob = await response.blob();
      const { name, lastModified } = JSON.parse(
        response.headers.get("fileData") || ""
      ) as { name: string; lastModified: number };
      return new File([blob], name, {
        type: blob.type,
        lastModified: lastModified,
      });
    case "response":
      return response;
    default:
      throw new Error(
        `Unsupported data type returned from server action: ${response.headers.get(
          "dataType"
        )}`
      );
  }
}

export default makeActionRequest;
