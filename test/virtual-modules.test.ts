import { afterEach, expect, test } from "bun:test";
import { createPluginTestEnv, type PluginTestEnv } from "frame-master/testing";
import BuildUnifier from "frame-master-plugin-build-unifier";
import createCloudFlareWorkerActionPlugin from "../src/index";

let env: PluginTestEnv | undefined;

afterEach(async () => {
	await env?.dispose();
	env = undefined;
});

test("loads the action bootstrap through the v4 runtime virtual-module registry", async () => {
	const plugin = createCloudFlareWorkerActionPlugin({
		actionBasePath: "test/fixtures/actions",
		outDir: ".frame-master/build",
	});
	env = await createPluginTestEnv({
		plugins: BuildUnifier({ plugins: [plugin] }),
		startServer: false,
		runCreateContext: false,
		runServerStart: false,
	});

	const runtimePlugin = env.pluginLoader
		.getVirtualModuleRegistry()
		.createPlugin(true);
	expect(runtimePlugin).not.toBeNull();
	await Bun.plugin(runtimePlugin!);

	const bootstrap = await import("@cloudflare-worker-action/bootstrap.ts");
	expect(bootstrap.default).toBeFunction();
});
