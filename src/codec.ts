import superjson from "superjson";

type FormDataLike = {
	entries(): IterableIterator<[string, unknown]>;
	getAll(key: string): unknown[];
};

export function encodeActionArgs(props: unknown[]): FormData {
	const formData = new FormData();
	if (props.length === 0) return formData;
	if (props.length === 1 && props[0] instanceof FormData) {
		return props[0];
	}

	let currentPropsIndex = 0;
	for (const prop of props) {
		if (prop instanceof FormData) {
			throw new Error(
				"only one prop is permitted with a FormData in a Worker Action",
			);
		}
		if (prop instanceof File) {
			currentPropsIndex++;
			formData.append(`FILE_${currentPropsIndex}`, prop);
			continue;
		}
		if (Array.isArray(prop) && prop.length > 0 && prop[0] instanceof File) {
			currentPropsIndex++;
			const id = `FILES_${currentPropsIndex}`;
			for (const item of prop) {
				if (!(item instanceof File)) {
					throw new Error(
						"only File instances are permitted inside an array of Files in a Worker Action",
					);
				}
				formData.append(id, item);
			}
			continue;
		}
		currentPropsIndex++;
		formData.append(`JSON_${currentPropsIndex}`, superjson.stringify(prop));
	}
	return formData;
}

export function encodeActionArgsToSearchParams(
	props: unknown[],
	pathname: string,
	origin: string,
): string {
	const url = new URL(pathname, origin);
	props.forEach((prop, index) => {
		url.searchParams.append(
			`arg_${index}`,
			encodeURIComponent(superjson.stringify(prop)),
		);
	});
	return url.toString();
}

export function decodeActionArgsFromFormData(
	formData?: FormDataLike,
): unknown[] {
	const propsArray: unknown[] = [];
	if (!formData) return propsArray;
	const batchIds = new Set<string>();
	for (const [key, value] of Array.from(formData.entries())) {
		if (key.startsWith("FILE_")) {
			propsArray.push(value);
			continue;
		}
		if (key.startsWith("FILES_")) {
			if (batchIds.has(key)) continue;
			batchIds.add(key);
			propsArray.push(formData.getAll(key));
			continue;
		}
		propsArray.push(superjson.parse(String(value)));
	}
	return propsArray;
}

export function decodeActionArgsFromURL(url: URL): unknown[] {
	return url.searchParams
		.entries()
		.toArray()
		.map(([, value]) => superjson.parse(decodeURIComponent(value)));
}

export function encodeActionResult(result: unknown): Response {
	switch (typeof result) {
		case "string":
		case "number":
		case "boolean":
		case "bigint":
		case "undefined":
			return new Response(superjson.stringify(result), {
				headers: {
					"Content-Type": "application/json",
					dataType: "json",
				},
			});
		case "object":
			if (result instanceof Response) {
				result.headers.set("dataType", "response");
				return result;
			}
			if (result instanceof File) {
				return new Response(result, {
					headers: {
						"Content-Type": result.type,
						dataType: "file",
						fileData: JSON.stringify({
							name: result.name,
							lastModified: result.lastModified,
						}),
					},
				});
			}
			if (result instanceof Blob) {
				const response = new Response(result);
				response.headers.set("dataType", "blob");
				response.headers.set("Content-Type", result.type);
				return response;
			}
			return new Response(superjson.stringify(result), {
				headers: { "Content-Type": "application/json", dataType: "json" },
			});
		default:
			throw new Error(`Unsupported return type from action: ${typeof result}`);
	}
}

export async function decodeActionResult(response: Response): Promise<unknown> {
	const dataType = response.headers.get("datatype");
	if (!response.ok && dataType !== "response") {
		throw new Error(
			`error when Calling worker action ${response.url}: ${response.statusText}`,
		);
	}

	switch (dataType) {
		case "json":
			return superjson.parse(await response.text());
		case "blob":
			return await response.blob();
		case "file": {
			const blob = await response.blob();
			const fileData = JSON.parse(response.headers.get("fileData") || "") as {
				name: string;
				lastModified: number;
			};
			return new File([blob], fileData.name, {
				type: blob.type,
				lastModified: fileData.lastModified,
			});
		}
		case "response":
			return response;
		default:
			try {
				return superjson.parse(await response.text());
			} catch (error) {
				throw new Error(
					`Unsupported data type returned from server action: ${response.headers.get(
						"dataType",
					)}`,
					{ cause: error },
				);
			}
	}
}
