import { cpSync } from "node:fs";
import { basename, join } from "node:path";
import {
	directiveToolSingleton,
	type FrameMasterPlugin,
} from "frame-master/plugin";
import { isProd, verboseLog } from "frame-master/utils";
import PackageJson from "../package.json";
import "frame-master-plugin-build-unifier";
import { getBuilder } from "frame-master/build";
import { getGlobalPluginContext } from "frame-master/plugin/utils";
import clientBootstrap from "./client/bootstrap.ts" with { type: "text" };

const clientBootstrapContents = clientBootstrap as unknown as string;

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
							const fileContent =
								args.__chainedContents ?? (await Bun.file(args.path).text());

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
									`import makeActionRequest from "@cloudflare-worker-action/bootstrap.ts";`,
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
		const pathToServerBootStrap = join(
			cwd,
			actionBasePath,
			"cloudflare-worker-action/server/bootstrap.cfabootstrap",
		);
		const pathToTempOutput = join(".frame-master", "cf-actions-temp");

		getGlobalPluginContext("build-unifier")?.setBuildConfig?.(
			PackageJson.name,
			{
				async afterBuild(conf, out) {
					cpSync(pathToTempOutput, FUNCTION_DIR, {
						recursive: true,
						force: true,
					});
					const allFiles = Array.from(
						new Bun.Glob("**/*").scanSync({
							absolute: true,
							cwd: FUNCTION_DIR,
						}),
					);
					await Promise.all(
						out.outputs
							.map((artifact) =>
								artifact.path.replace(pathToTempOutput, FUNCTION_DIR),
							)
							.filter((finalPath) => !allFiles.includes(finalPath))
							.map((fp) =>
								Bun.file(fp)
									.delete()
									.catch((e) =>
										console.warn(`Failed to delete file ${fp}:`, e),
									),
							),
					);
				},
				buildConfig: () => ({
					outdir: pathToTempOutput,
					target: "browser",
					throw: true,
					loader: {
						".cfabootstrap": "ts",
					},
					entrypoints: Object.values(createRouteMatcher().routes),
					files: {
						[pathToServerBootStrap]: `export { default } from "${join(__dirname, "server", "index.ts")}";`,
					},
					plugins: [
						{
							name: "cloudflare-action-dev-plugin",
							setup(build) {
								build.onLoad(
									{
										filter: actionBasePathRegex,
									},
									async (args) => {
										if (
											args.path.match(/.*_middleware\.(js|ts)$/) ||
											(await directiveToolSingleton.pathIs(
												"no-action",
												args.path,
											))
										) {
											return {
												contents:
													args.__chainedContents ??
													(await Bun.file(args.path).text()),
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
												`import createOnRequest from "${pathToServerBootStrap}";`,
												(args.__chainedContents as string) ??
													(await Bun.file(args.path).text()),
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
					],
					splitting: true,
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
		const builder = await getGlobalPluginContext("build-unifier")?.getBuilder?.(
			PackageJson.name,
		);

		if (!builder) {
			throw new Error(
				`Builder instance not found in Cloudflare Worker Action Plugin. Make sure that "frame-master-plugin-build-unifier" is included in the plugins array and its version satisfies the requirement specified in package.json.`,
			);
		}

		if (builder.isBuilding()) return await builder.awaitBuildFinish();
		return builder.build();
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

		process.on("SIGINT", (sig) => {
			proc.kill(sig);
			process.exit();
		});
		process.on("exit", (code) => {
			proc.kill();
			process.exit(code);
		});
		process.on("SIGTERM", (sig) => {
			proc.kill(sig);
			process.exit();
		});
		process.on("SIGHUP", (sig) => {
			proc.kill(sig);
			process.exit();
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
			"@cloudflare-worker-action/bootstrap.ts": {
				contents: clientBootstrapContents,
				loader: "ts",
				injectRuntime: true,
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
			frameMasterPlugins: {
				"frame-master-plugin-build-unifier": PackageJson.peerDependencies["frame-master-plugin-build-unifier"],
			},
		},
	};
}
