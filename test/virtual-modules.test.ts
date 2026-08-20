import { afterEach, expect, test } from "bun:test";
import { createPluginTestEnv, type PluginTestEnv } from "frame-master/testing";
import { resetBuildPipelines } from "../node_modules/frame-master/src/build/pipelines.ts";
import { peerDependencies } from "../package.json";
import { createActionPlugin, wrapActionPlugin } from "./helpers";

let env: PluginTestEnv | undefined;

afterEach(async () => {
	await env?.dispose();
	env = undefined;
	resetBuildPipelines();
});

const CLIENT_BOOTSTRAP = "@cloudflare-worker-action/bootstrap.ts";
const SERVER_BOOTSTRAP = "@cloudflare-worker-action/server.ts";

test("derives requirement.frameMasterVersion from the package peer", () => {
	const plugin = createActionPlugin();
	expect(plugin.requirement?.frameMasterVersion).toBe(
		peerDependencies["frame-master"],
	);
	expect(plugin.requirement?.frameMasterVersion).toBe("^4.0.0-0");
	expect(plugin.requirement?.frameMasterPlugins).toBeUndefined();
});

test("loads the action bootstrap through the v4 runtime virtual-module registry", async () => {
	const { plugins } = wrapActionPlugin();
	env = await createPluginTestEnv({
		plugins,
		startServer: false,
		runCreateContext: false,
		runServerStart: false,
	});

	const registry = env.pluginLoader.getVirtualModuleRegistry();
	const client = registry.getModule(CLIENT_BOOTSTRAP);
	expect(client).toBeDefined();
	expect(client?.injectRuntime).toBe(true);
	expect(client?.loader).toBe("ts");
	expect(String(client?.contents)).toContain("client/bootstrap.ts");

	const server = registry.getModule(SERVER_BOOTSTRAP);
	expect(server).toBeDefined();
	expect(server?.injectRuntime).toBe(false);
	expect(server?.loader).toBe("ts");
	expect(String(server?.contents)).toContain("server/index.ts");

	const runtimePlugin = registry.createPlugin(true);
	expect(runtimePlugin).not.toBeNull();
	await Bun.plugin(runtimePlugin!);

	const bootstrap = await import("@cloudflare-worker-action/bootstrap.ts");
	expect(bootstrap.default).toBeFunction();
});

test("declares virtual bootstraps without BuildConfig.files", () => {
	const plugin = createActionPlugin();
	const buildConfig = plugin.build?.buildConfig;
	expect(typeof buildConfig).toBe("function");
	const config = typeof buildConfig === "function" ? buildConfig() : buildConfig;
	expect(config?.files).toBeUndefined();
	expect(plugin.runtimePlugins ?? []).toBeEmpty();
	expect(plugin.virtualModules?.[CLIENT_BOOTSTRAP]?.injectRuntime).toBe(true);
	expect(plugin.virtualModules?.[SERVER_BOOTSTRAP]?.injectRuntime).toBe(false);
});

test("serverStop kills a spawned Wrangler stub", async () => {
	const plugin = createActionPlugin();
	expect(typeof plugin.serverStop).toBe("function");

	const killed: string[] = [];
	global.WRANGLER_PROCESS = {
		killed: false,
		exitCode: null,
		kill() {
			killed.push("kill");
		},
	} as unknown as Bun.Subprocess;

	await plugin.serverStop?.({
		builder: {} as never,
		pluginLoader: {} as never,
		config: {} as never,
		server: null,
		reason: "dispose",
	});

	expect(killed).toEqual(["kill"]);
});
