import { cpSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	directiveToolSingleton,
	type FrameMasterPlugin,
	getBuildPipelines,
	getBuildUnifierContext,
	getChainableContent,
} from "frame-master/plugin";
import { isProd, verboseLog } from "frame-master/utils";
import PackageJson from "../package.json";
import { getBuilder } from "frame-master/build";

declare global {
	var WRANGLER_PROCESS: Bun.Subprocess;
}

declare module "frame-master/plugin/utils" {
	interface CustomDirectives {
		"no-action": true;
	}
}

export type CloudFlareWorkerActionPluginOptions<fetchType = typeof fetch> = {
	actionBasePath: string;
	/** Wrangler port default: 8787 */
	serverPort?: number;
	/**
	 * Build output directory
	 *
	 * default: buildConfig.outdir
	 */
	outDir: string;
	/**
	 * Custom fetch implementation for making requests to the worker.
	 */
	customFetch?: string | fetchType;
	/**
	 * Override the default build configuration.
	 */
	buildFunctionConfigOverride?:
		| Partial<Bun.BuildConfig>
		| (() => Partial<Bun.BuildConfig>);

	suppressWranings?: Partial<{
		/** Suppress warnings for dynamic route files being used as client actions */
		dynamicRoute: boolean;
	}>;
};
const FUNCTION_DIR = "functions";
const CLIENT_BOOTSTRAP_SPECIFIER = "@cloudflare-worker-action/bootstrap.ts";
const SERVER_BOOTSTRAP_SPECIFIER = "@cloudflare-worker-action/server.ts";
const cloudflareActionPluginDisplayName = "Cloudflare-action-plugin";
const WRANGLER_READY_TIMEOUT_MS = 30_000;
const WRANGLER_POLL_INTERVAL_MS = 250;
const WRANGLER_PROBE_TIMEOUT_MS = 1_500;
const cwd = process.cwd();

async function waitForWranglerReady(proc: Bun.Subprocess, port: number) {
	const readinessUrl = `http://127.0.0.1:${port}/`;
	const timeoutAt = Date.now() + WRANGLER_READY_TIMEOUT_MS;

	while (Date.now() < timeoutAt) {
		if (proc.exitCode !== null) {
			throw new Error(
				`Wrangler exited with code ${proc.exitCode} before becoming ready`,
			);
		}

		try {
			const response = await fetch(readinessUrl, {
				method: "GET",
				redirect: "manual",
				signal: AbortSignal.timeout(WRANGLER_PROBE_TIMEOUT_MS),
			});

			await response.body?.cancel();
			return;
		} catch {}

		await Bun.sleep(WRANGLER_POLL_INTERVAL_MS);
	}

	throw new Error(
		`Timed out waiting for Wrangler to accept requests on ${readinessUrl}`,
	);
}
export default function createCloudFlareWorkerActionPlugin(
	props: CloudFlareWorkerActionPluginOptions,
): FrameMasterPlugin {
	const { actionBasePath, serverPort = 8787 } = props;

	const actionBasePathRegex = new RegExp(
		`${actionBasePath.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}/.*\\.(ts|js|tsx|jsx)$`,
	);

	const createRouteMatcher = () =>
		new Bun.FileSystemRouter({
			dir: actionBasePath,
			style: "nextjs",
		});

	function createClientConfig(): Partial<Bun.BuildConfig> {
		const routeMatcher = createRouteMatcher();
		return {
			plugins: [
				{
					name: "cloudflare-worker-action-plugin",
					setup(build) {
						const transpiler = new Bun.Transpiler({
							loader: "tsx",
						});

						// Transpile to client action
						build.onLoad({ filter: actionBasePathRegex }, async (args) => {
							const fileContent = await getChainableContent(args);

							const clientPathname = Object.entries(routeMatcher.routes)
								.find(([_pathname, filepath]) => args.path === filepath)
								?.at(0);

							const filename = basename(args.path);

							if (filename?.startsWith("_middleware")) {
								throw new Error(
									`You are trying to use a middleware file (${filename}) as a client action. This is not supported`,
								);
							} else if (
								await directiveToolSingleton.pathIs("no-action", args.path)
							) {
								throw new Error(
									`You are trying to use a file with "no-action" directive (${filename}) as a client action. This is not supported`,
								);
							} else if (filename?.match(/^\[.*\]\.[^.]+$/)) {
								throw new Error(
									`You are trying to use a dynamic route file (${filename}) as a client action. This is not supported`,
								);
							}

							const fetcherString =
								(typeof props.customFetch === "function"
									? props.customFetch.toString()
									: props.customFetch) ?? "fetch";
							return {
								contents: [
									`import makeActionRequest from "${CLIENT_BOOTSTRAP_SPECIFIER}";`,
									...(transpiler.scan(fileContent).exports ?? []).map(
										(exp) =>
											`export const ${exp} = (...args) => makeActionRequest(args, "${clientPathname}","${exp}", ${fetcherString});`,
									),
								].join("\n"),
								loader: "tsx",
							};
						});
					},
				},
			],
		};
	}
	const createServerFunctionsBuildConfig = () => {
		const pipelineReady = getBuildPipelines().some((pipeline) =>
			pipeline.pluginNames.includes(PackageJson.name),
		);
		if (!pipelineReady) return;

		const pathToTempOutput = join(".frame-master", "cf-actions-temp");

		getBuildUnifierContext()?.setBuildConfig?.(
			PackageJson.name,
			{
				async afterBuild(conf, out) {
					rmSync(FUNCTION_DIR, { recursive: true, force: true });
					mkdirSync(FUNCTION_DIR, { recursive: true });
					await Promise.all(
						out.outputs.map(async (artifact) => {
							const dest = artifact.path.replace(
								pathToTempOutput,
								FUNCTION_DIR,
							);
							mkdirSync(dirname(dest), { recursive: true });
							cpSync(artifact.path, dest);
						}),
					);
				},
				buildConfig: () => ({
					outdir: pathToTempOutput,
					target: "browser",
					throw: true,
					entrypoints: Object.values(createRouteMatcher().routes),
					plugins: [
						{
							name: "cloudflare-action-dev-plugin",
							setup(build) {
								build.onLoad(
									{
										filter: actionBasePathRegex,
									},
									async (args) => {
									const fileContent = await getChainableContent(args);
									if (
										args.path.match(/.*_middleware\.(js|ts)$/) ||
										(await directiveToolSingleton.pathIs(
											"no-action",
											args.path,
										))
									) {
										return {
											contents: fileContent,
										};
									}
									const filename = basename(args.path);
									if (
										filename.match(/^\[.*\]\.[^.]+$/) &&
										!props.suppressWranings?.dynamicRoute
									) {
										console.warn(
											`You are trying to use a dynamic route file (${filename}) as a client action. This is not recommended`,
										);
									}

									return {
										contents: [
											`import createOnRequest from "${SERVER_BOOTSTRAP_SPECIFIER}";`,
											fileContent,
												`
												const handlers = {
													${[
														"GET",
														"POST",
														"PUT",
														"DELETE",
														"PATCH",
														"HEAD",
														"OPTIONS",
													]
														.map(
															(method) =>
																`${method}: typeof ${method} === "function" ? ${method} : undefined`,
														)
														.join(",\n")}
												};
												export const onRequest = createOnRequest(handlers);
												`,
											].join("\n"),
											loader: "tsx",
										};
									},
								);
							},
						},
						{
							name: "stub-browser-only-for-workers",
							setup(build) {
								build.onResolve(
									{
										filter:
											/(?:^|\/)(mermaid|@lightenna\/react-mermaid-diagram)(?:\/|$)/,
									},
									(args) => ({
										path: args.path,
										namespace: "cf-browser-stub",
									}),
								);
								build.onLoad(
									{ filter: /.*/, namespace: "cf-browser-stub" },
									() => ({
										contents:
											"export default {}; export const MermaidDiagram = () => null;",
										loader: "js",
									}),
								);
							},
						},
					],
					splitting: false,
					root: actionBasePath,
					minify: isProd(),
					naming: {
						entry: "[dir]/[name].[ext]",
					},
					...(props.buildFunctionConfigOverride
						? typeof props.buildFunctionConfigOverride === "function"
							? props.buildFunctionConfigOverride()
							: props.buildFunctionConfigOverride
						: {}),
				}),
			},
		);
	};

	const makeDevBuild = async () => {
		const builder = await getBuildUnifierContext()?.getBuilder?.(
			PackageJson.name,
		);

		if (!builder) {
			throw new Error(
				`Builder instance not found in Cloudflare Worker Action Plugin. Wrap this plugin with BuildUnifier({ id: "cf-actions", plugins: [...] }) from "frame-master/plugin" (or the legacy frame-master-plugin-build-unifier package).`,
			);
		}

		if (builder.isBuilding()) return await builder.awaitBuildFinish();
		return builder.build();
	};

	const stopWrangler = () => {
		const proc = global.WRANGLER_PROCESS;
		if (proc && !proc.killed && proc.exitCode === null) {
			proc.kill();
		}
		global.WRANGLER_PROCESS = undefined as unknown as Bun.Subprocess;
	};

	const spawnWrangler = () => {
		const outdir = getBuilder()?.getConfig()?.outdir || ".frame-master/build";
		const proc = Bun.spawn({
			cmd: [
				"bunx",
				"wrangler",
				"pages",
				"dev",
				outdir,
				"--port",
				serverPort.toString(),
			],
			stdout: "inherit",
			stderr: "inherit",
			stdin: "ignore",
		});

		const isReady = waitForWranglerReady(proc, serverPort).catch((error) => {
			if (!proc.killed && proc.exitCode === null) proc.kill();
			throw error;
		});

		return { proc, isReady };
	};

	createServerFunctionsBuildConfig();
	return {
		name: PackageJson.name,
		version: PackageJson.version,
		virtualModules: {
			[CLIENT_BOOTSTRAP_SPECIFIER]: {
				contents: `export { default } from ${JSON.stringify(join(__dirname, "client", "bootstrap.ts"))};`,
				loader: "ts",
				injectRuntime: true,
			},
			[SERVER_BOOTSTRAP_SPECIFIER]: {
				contents: `export { default } from "${join(__dirname, "server", "index.ts")}";`,
				loader: "ts",
				injectRuntime: false,
			},
		},
		directives: [
			{
				name: "no-action",
				regex:
					/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]no[-\s]action['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
			},
		],

		build: {
			buildConfig: createClientConfig,
		},
		fileSystemWatchDir: [actionBasePath],
		async onFileSystemChange(_ev, _path, absolutePath) {
			if (!absolutePath.startsWith(actionBasePath)) return;
			directiveToolSingleton.clearPaths();
			createServerFunctionsBuildConfig();
			const res = await makeDevBuild();
			verboseLog(
				`Cloudflare Worker Action - Function Bundle rebuilt: ${res?.success ? "success" : "failed"}`,
			);
		},

		async createContext() {
			createServerFunctionsBuildConfig();
		},

		serverStart: {
			async dev_main() {
				await makeDevBuild();
				if (global.WRANGLER_PROCESS && !global.WRANGLER_PROCESS.killed) return;
				const proc = spawnWrangler();
				console.log(
					`[${cloudflareActionPluginDisplayName}] Starting Wrangler...`,
				);
				global.WRANGLER_PROCESS = proc.proc;
				return proc.isReady.then(() =>
					console.log(
						`[${cloudflareActionPluginDisplayName}] Wrangler dev server is ready`,
					),
				);
			},
		},
		serverStop() {
			stopWrangler();
		},
		router: {
			async request(master) {
				if (
					master.isResponseSetted() ||
					!master.request.headers.get("x-server-action")
				)
					return;
				const url = new URL(master.request.url);
				url.port = serverPort.toString();
				const req = master.request;

				const targetUrl = url.toString();

				const headers = new Headers(req.headers);
				headers.set("host", `localhost:${serverPort}`);

				const isBodyAllowed = !["GET", "HEAD"].includes(req.method);
				console.log(
					`Proxying request to Cloudflare Worker Action: ${req.method} ${targetUrl}`,
				);
				master.preventLog();
				const res = await fetch(targetUrl, {
					method: req.method,
					headers,
					body: isBodyAllowed ? req.body : undefined,
				});
				if (res.headers.get("Content-Encoding") === "gzip") {
					const unzipped = await res.text();
					const newHeaders = new Headers(res.headers);
					newHeaders.delete("Content-Encoding");
					master
						.setResponse(unzipped, {
							status: res.status,
							headers: newHeaders,
						})
						.preventGlobalValuesInjection()
						.preventRewrite()
						.sendNow();
					return;
				}
				master
					.setResponse(await res.arrayBuffer(), {
						status: res.status,
						headers: res.headers,
					})
					.sendNow();
			},
		},
		requirement: {
			frameMasterVersion: PackageJson.peerDependencies["frame-master"],
			bunVersion: ">=1.3.10",
		},
	};
}
