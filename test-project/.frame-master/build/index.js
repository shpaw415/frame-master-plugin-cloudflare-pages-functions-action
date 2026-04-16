import { bootstrap_default } from "./chunk-zcx7xa1a.js";

// src/action/action.ts
var GET = (...args) =>
	bootstrap_default(args, "/action", "GET", (url, init) => {
		const header = new Headers(init?.headers);
		header.set(
			"x-custom-header",
			"This is a custom header added by the custom fetch function!",
		);
		const modifiedInit = {
			...init,
			headers: header,
		};
		return fetch(url, modifiedInit);
	});

// index.ts
GET({
	lol: true,
});

//# debugId=D9B0A94963DAC2D564756E2164756E21
//# sourceMappingURL=./index.js.map
