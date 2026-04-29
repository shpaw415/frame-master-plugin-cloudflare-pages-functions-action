import { join } from "node:path";
import { builder } from "frame-master/build";
import type { FrameMasterPlugin } from "frame-master/plugin";
import type { FrameMasterConfig } from "frame-master/server/types";
import BuildUnifier from "frame-master-plugin-build-unifier";
import ServerAction from "../src";

export default {
	HTTPServer: {
		port: 3001,
	},
	pluginsOptions: {
		entrypoints: ["./src/index.html"],
	},
	plugins: [
		{
			name: "serve-build",
			version: "1.0.0",

			router: {
				request(master) {
					const cwd = join(__dirname, ".frame-master/build");
					const files = Array.from(
						new Bun.Glob("**/*").scanSync({
							onlyFiles: true,
							absolute: true,
							cwd,
						}),
					);
					if (files.includes(join(cwd, master.URL.pathname))) {
						master
							.setResponse(Bun.file(join(cwd, master.URL.pathname)))
							.sendNow();
					}
				},
			},
			serverStart: {
				dev_main() {
					if (builder?.isBuilding()) return;
					builder?.build();
				},
			},
		},
		...BuildUnifier({
			plugins: [
				ServerAction({
					outDir: ".frame-master/build",
					actionBasePath: "src/action",
					customFetch: (url, init) => {
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
					},
				}) as FrameMasterPlugin,
			],
		}),
		{
			name: "test-plugin",
			version: "1.0.0",
			build: {
				buildConfig: {
					entrypoints: ["index.ts"],
				},
			},
		},
	],
} satisfies FrameMasterConfig;
