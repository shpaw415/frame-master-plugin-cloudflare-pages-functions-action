import { BuildUnifier } from "frame-master/plugin";
import createCloudFlareWorkerActionPlugin, {
	type CloudFlareWorkerActionPluginOptions,
} from "../src/index";

export function createActionPlugin(
	overrides: Partial<CloudFlareWorkerActionPluginOptions> = {},
) {
	return createCloudFlareWorkerActionPlugin({
		actionBasePath: "test/fixtures/actions",
		outDir: ".frame-master/build",
		...overrides,
	});
}

export function wrapActionPlugin(
	plugin = createActionPlugin(),
	id = `cf-actions-${crypto.randomUUID()}`,
) {
	return {
		plugin,
		plugins: BuildUnifier({
			id,
			label: "Cloudflare actions",
			plugins: [plugin],
		}),
	};
}
