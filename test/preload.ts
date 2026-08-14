import { loadRuntimePluginFromPlugins } from "frame-master/testing";
import BuildUnifier from "frame-master-plugin-build-unifier";
import createCloudFlareWorkerActionPlugin from "../src/index";

await loadRuntimePluginFromPlugins(
	BuildUnifier({
		plugins: [
			createCloudFlareWorkerActionPlugin({
				actionBasePath: "test/fixtures/actions",
				outDir: ".frame-master/build",
			}),
		],
	}),
);
