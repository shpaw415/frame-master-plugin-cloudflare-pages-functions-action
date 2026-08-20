import { expect, test } from "bun:test";
import type { EventContext } from "@cloudflare/workers-types";
import makeActionRequest from "../src/client/bootstrap";
import WrapRequestHandler from "../src/server/bootstrap";

function createFetcher(endpoint: (...args: unknown[]) => unknown) {
	return async (input: RequestInfo | URL, init?: RequestInit) => {
		const href =
			typeof input === "string" && input.startsWith("/")
				? `http://localhost${input}`
				: input;
		const request = new Request(href, init);
		return WrapRequestHandler(
			{ request } as unknown as EventContext<never, never, never>,
			endpoint,
		);
	};
}

test("POST keeps an explicit undefined argument in position", async () => {
	const received: unknown[] = [];
	const fetcher = createFetcher((a, b) => {
		received.push(a, b);
		return { aUndefined: a === undefined, b };
	});

	const result = await makeActionRequest(
		[undefined, "x"],
		"http://localhost/echo",
		"POST",
		fetcher,
	);

	expect(received[0]).toBeUndefined();
	expect(received[1]).toBe("x");
	expect(result).toEqual({ aUndefined: true, b: "x" });
});

test("POST pads omitted trailing props with undefined", async () => {
	const received: unknown[] = [];
	const fetcher = createFetcher((a: unknown, b: unknown) => {
		received.push(a, b);
		return { bUndefined: b === undefined };
	});

	const result = await makeActionRequest(["only"], "/echo", "POST", fetcher);
	expect(received).toEqual(["only", undefined]);
	expect(result).toEqual({ bUndefined: true });
});

test("GET keeps undefined props and distinct query keys", async () => {
	const received: unknown[] = [];
	const fetcher = createFetcher((a, b) => {
		received.push(a, b);
		return { a, b };
	});

	const result = await makeActionRequest(
		[undefined, "x"],
		"http://localhost/echo",
		"GET",
		fetcher,
	);

	expect(received[0]).toBeUndefined();
	expect(received[1]).toBe("x");
	expect(result).toEqual({ a: undefined, b: "x" });
});

test("round-trips Date and bigint arguments and an undefined return", async () => {
	const date = new Date("2026-01-02T03:04:05.000Z");
	const fetcher = createFetcher((when, count) => {
		expect(when).toEqual(date);
		expect(count).toBe(9n);
		return undefined;
	});

	const result = await makeActionRequest([date, 9n], "/echo", "POST", fetcher);
	expect(result).toBeUndefined();
});
