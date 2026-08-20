import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import {
	configureBuildPipelines,
	initializeBuildPipelines,
	resetBuildPipelines,
} from "../node_modules/frame-master/src/build/pipelines.ts";
import {
	createPluginTestEnv,
	type PluginTestEnv,
	withTempDir,
	writeFixture,
} from "frame-master/testing";
import { getBuildPipeline, getBuildUnifierContext } from "frame-master/plugin";
import PackageJson from "../package.json";
import { createActionPlugin, wrapActionPlugin } from "./helpers";

let env: PluginTestEnv | undefined;

afterEach(async () => {
	await env?.dispose();
	env = undefined;
	resetBuildPipelines();
});

test("core BuildUnifier registers the isolated functions pipeline", async () => {
	const { plugin, plugins } = wrapActionPlugin();
	env = await createPluginTestEnv({
		plugins,
		startServer: false,
		runCreateContext: true,
		runServerStart: false,
	});

	await configureBuildPipelines(env.config, env.pluginLoader);

	const pipeline = getBuildPipeline(PackageJson.name);
	expect(pipeline.pluginNames).toContain(PackageJson.name);
	expect(getBuildUnifierContext()?.setBuildConfig).toBeTypeOf("function");
	expect(plugin.requirement?.frameMasterPlugins).toBeUndefined();
});

test("core BuildUnifier builds function artifacts for an action file", async () => {
	await withTempDir(async (dir) => {
		await writeFixture(
			dir,
			"src/action/echo.ts",
			`export async function POST(value: unknown) {
  return { value, missing: value === undefined };
}
`,
		);

		const { plugins } = wrapActionPlugin(
			createActionPlugin({
				actionBasePath: join(dir, "src/action"),
				outDir: join(dir, ".frame-master/build"),
			}),
		);

		env = await createPluginTestEnv({
			plugins,
			cwd: dir,
			startServer: false,
			runCreateContext: true,
			runServerStart: false,
		});

		await configureBuildPipelines(env.config, env.pluginLoader);
		await initializeBuildPipelines();

		const builder = await getBuildPipeline(PackageJson.name).getBuilder(
			PackageJson.name,
		);
		const result = await builder.build();
		expect(result.success).toBe(true);
		const echo = result.outputs.find((output) =>
			output.path.replaceAll("\\", "/").includes("/echo."),
		);
		expect(echo).toBeDefined();
		expect(await echo!.text()).toContain("onRequest");
	});
});
