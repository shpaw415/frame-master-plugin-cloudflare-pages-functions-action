import type {
	Response as CFResponse,
	EventContext,
} from "@cloudflare/workers-types";
import {
	decodeActionArgsFromFormData,
	decodeActionArgsFromURL,
	encodeActionResult,
} from "../codec";

export default async function WrapRequestHandler(
	context: EventContext<never, never, never>,
	endpoint: (...args: unknown[]) => unknown,
): Promise<CFResponse> {
	const isServerAction =
		context.request.headers.get("x-server-action") === "true";
	if (!isServerAction) {
		return new Response("Not Found", { status: 404 }) as unknown as CFResponse;
	}
	const parsedData =
		context.request.method === "GET" || context.request.method === "HEAD"
			? decodeActionArgsFromURL(new URL(context.request.url))
			: decodeActionArgsFromFormData(
					context.request.headers.get("content-type")
						? await context.request.formData()
						: undefined,
				);

	const missingProps = endpoint.length - parsedData.length;
	for (let i = 0; i < missingProps; i++) {
		parsedData.push(undefined);
	}
	parsedData.push(context);

	return encodeActionResult(
		await endpoint(...parsedData),
	) as unknown as CFResponse;
}
