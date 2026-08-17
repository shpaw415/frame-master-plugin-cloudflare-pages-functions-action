import { loadRuntimePluginFromPlugins } from "frame-master/testing";
import createCloudFlareWorkerActionPlugin from "../src/index";

await loadRuntimePluginFromPlugins([
	createCloudFlareWorkerActionPlugin({
		actionBasePath: "test/fixtures/actions",
		outDir: ".frame-master/build",
	}),
]);
