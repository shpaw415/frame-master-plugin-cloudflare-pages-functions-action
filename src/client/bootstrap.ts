import {
	decodeActionResult,
	encodeActionArgs,
	encodeActionArgsToSearchParams,
} from "../codec";

async function makeActionRequest(
	props: Array<unknown>,
	pathname: string,
	method:
		| "GET"
		| "POST"
		| "PUT"
		| "DELETE"
		| "PATCH"
		| "HEAD"
		| "OPTIONS" = "POST",
	fetcher = fetch,
) {
	if ((method === "GET" || method === "HEAD") && props.length > 0) {
		const origin = globalThis.location?.origin ?? "http://localhost";
		const res = await fetcher(
			encodeActionArgsToSearchParams(props, pathname, origin),
			{
				method,
				headers: {
					"x-server-action": "true",
					"x-params-url": "true",
				},
			},
		);
		return await decodeActionResult(res);
	}

	const res = await fetcher(pathname, {
		method,
		body: props.length > 0 ? encodeActionArgs(props) : undefined,
		headers: {
			"x-server-action": "true",
		},
	});
	return await decodeActionResult(res);
}

export default makeActionRequest;
