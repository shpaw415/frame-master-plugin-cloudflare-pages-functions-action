import type {
	Response as CFResponse,
	PagesFunction,
} from "@cloudflare/workers-types";
import Wrapper from "./bootstrap";

type METHODS = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export default function createOnRequest(
	handlers: Partial<Record<METHODS, () => unknown>>,
): PagesFunction<never, never, never> {
	return async (context) => {
		const method = context.request.method as METHODS;

		if (!handlers[method]) {
			return new Response(`Method "${method}" Not Allowed`, {
				status: 405,
			}) as unknown as CFResponse;
		}
		return await Wrapper(context, handlers[method]);
	};
}
