import { expect, test } from "bun:test";
import superjson from "superjson";
import {
	decodeActionArgsFromFormData,
	decodeActionArgsFromURL,
	decodeActionResult,
	encodeActionArgs,
	encodeActionArgsToSearchParams,
	encodeActionResult,
} from "../src/codec";

test("preserves undefined, nested undefined, Date, bigint, Map, and Set", () => {
	const date = new Date("2026-08-20T00:00:00.000Z");
	const props = [
		undefined,
		{ a: undefined, b: "ok" },
		date,
		1n,
		new Map([["k", "v"]]),
		new Set([1, 2]),
		null,
	];

	const decoded = decodeActionArgsFromFormData(encodeActionArgs(props));
	expect(decoded).toHaveLength(7);
	expect(decoded[0]).toBeUndefined();
	expect(decoded[1]).toEqual({ a: undefined, b: "ok" });
	expect(decoded[2]).toEqual(date);
	expect(decoded[3]).toBe(1n);
	expect(decoded[4]).toEqual(new Map([["k", "v"]]));
	expect(decoded[5]).toEqual(new Set([1, 2]));
	expect(decoded[6]).toBeNull();
});

test("writes SuperJSON payloads instead of JSON.stringify for undefined", () => {
	const formData = encodeActionArgs([undefined]);
	const raw = String(formData.get("JSON_1"));
	expect(raw).not.toBe("undefined");
	const payload = JSON.parse(raw) as {
		json: unknown;
		meta?: { values?: unknown };
	};
	expect(payload.json).toBeNull();
	expect(payload.meta?.values).toEqual(["undefined"]);
	expect(superjson.parse(raw)).toBeUndefined();
});

test("round-trips File and File[] without SuperJSON", async () => {
	const file = new File(["hello"], "hello.txt", { type: "text/plain" });
	const other = new File(["world"], "world.txt", { type: "text/plain" });
	const decoded = decodeActionArgsFromFormData(
		encodeActionArgs([file, [other]]),
	);

	expect(decoded[0]).toBeInstanceOf(File);
	expect((decoded[0] as File).name).toBe("hello.txt");
	expect(await (decoded[0] as File).text()).toBe("hello");
	expect(Array.isArray(decoded[1])).toBe(true);
	expect((decoded[1] as File[])[0]?.name).toBe("world.txt");
});

test("encodes GET args with incrementing SuperJSON query params", () => {
	const href = encodeActionArgsToSearchParams(
		[undefined, "x"],
		"/echo",
		"http://localhost",
	);
	const url = new URL(href);
	expect([...url.searchParams.keys()]).toEqual(["arg_0", "arg_1"]);
	expect(decodeActionArgsFromURL(url)).toEqual([undefined, "x"]);
});

test("encodes undefined action results as SuperJSON json", async () => {
	const response = encodeActionResult(undefined);
	expect(response.headers.get("dataType")).toBe("json");
	expect(response.status).toBe(200);
	expect(await decodeActionResult(response)).toBeUndefined();
});
