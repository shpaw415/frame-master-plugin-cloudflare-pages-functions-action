import type {
	Response as CFResponse,
	PagesFunction,
} from "@cloudflare/workers-types";
import Wrapper from "../functions-bootstrap";

type METHODS = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export const onRequest: PagesFunction<never, never, never> = async (
	context,
) => {
	const method = context.request.method as METHODS;

	const options = {
		// @ts-expect-error
		GET: typeof GET === "function" ? GET : undefined,
		// @ts-expect-error
		POST: typeof POST === "function" ? POST : undefined,
		// @ts-expect-error
		PUT: typeof PUT === "function" ? PUT : undefined,
		// @ts-expect-error
		DELETE: typeof DELETE === "function" ? DELETE : undefined,
		// @ts-expect-error
		PATCH: typeof PATCH === "function" ? PATCH : undefined,
		// @ts-expect-error
		HEAD: typeof HEAD === "function" ? HEAD : undefined,
		// @ts-expect-error
		OPTIONS: typeof OPTIONS === "function" ? OPTIONS : undefined,
	};

	if (!options[method]) {
		return new Response(`Method "${method}" Not Allowed`, {
			status: 405,
		}) as unknown as CFResponse;
	}
	return await Wrapper(context, options[method]);
};
