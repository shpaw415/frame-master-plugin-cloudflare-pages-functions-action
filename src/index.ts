import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	type Directives,
	directiveToolSingleton,
	type FrameMasterPlugin,
} from "frame-master/plugin";
import { verboseLog } from "frame-master/utils";
import PackageJson from "../package.json";
import "frame-master-plugin-build-unifier";
import { getBuilder } from "frame-master/build";
import { getGlobalPluginContext } from "frame-master/plugin/utils";

declare global {
	var WRANGLER_PROCESS: Bun.Subprocess;
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
};
const FUNCTION_DIR = "functions";
const cloudflareActionPluginDisplayName = "Cloudflare-action-plugin";
const WRANGLER_READY_TIMEOUT_MS = 30_000;
const WRANGLER_POLL_INTERVAL_MS = 250;
const WRANGLER_PROBE_TIMEOUT_MS = 1_500;

function wrapWithCloudFlareEventHandler(
	moduleContent: string,
	miniflareScript: string,
) {
	return [moduleContent, miniflareScript].join("\n");
}

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

	let routeMatcher: Bun.FileSystemRouter;
	let transpiledCloudFlareScript: string;

	async function createConfig(): Promise<Partial<Bun.BuildConfig>> {
		const glob = new Bun.Glob("**/*.{ts,js}");
		const transpiler = new Bun.Transpiler({
			loader: "ts",
		});

		const files = Array.from(
			glob.scanSync({
				cwd: actionBasePath,
				onlyFiles: true,
				absolute: true,
			}),
		);

		const parsedFile = (
			await Promise.all(
				files.map(async (filePath) => {
					const fileContent = await Bun.file(filePath).text();
					const exported = transpiler.scan(fileContent).exports;
					return {
						filePath,
						actions: exported,
					};
				}),
			)
		).filter((parsed) => parsed.actions.length > 0);

		const absoluteEntryPoints = parsedFile.map((parsed) => parsed.filePath);

		return {
			entrypoints: [join("cloudflare-worker-action/bootstrap")],
			plugins: [
				{
					name: "cloudflare-worker-action-plugin",
					setup(build) {
						// Resolve bootstrap file
						build.onResolve(
							{ filter: /^cloudflare-worker-action\/bootstrap$/ },
							() => {
								return {
									path: join(__dirname, "bootstrap.ts"),
									namespace: "cloudflare-client-bootstrap",
								};
							},
						);
						// Load bootstrap file
						build.onLoad(
							{ filter: /.*/, namespace: "cloudflare-client-bootstrap" },
							async (args) => {
								return {
									contents: await Bun.file(args.path).text(),
									loader: "ts",
								};
							},
						);
						// Transpile to client action
						build.onLoad({ filter: /.*/ }, async (args) => {
							if (absoluteEntryPoints.includes(args.path) === false) {
								return;
							}
							const exports = parsedFile.find(
								(pf) => pf.filePath === args.path,
							)?.actions;

							const clientPathArray = args.path
								.split(actionBasePath)
								.pop()
								?.split(".");
							clientPathArray?.pop();
							let clientPath = clientPathArray
								?.join(".")
								.replaceAll(/\\/g, "/");

							if (clientPath?.endsWith("/index")) {
								clientPath = clientPath.slice(0, -"/index".length);
							}
							const fetcherString =
								(typeof props.customFetch === "function"
									? props.customFetch.toString()
									: props.customFetch) ?? "fetch";
							return {
								contents: [
									`import makeActionRequest from "cloudflare-worker-action/bootstrap";`,
									...(exports ?? []).map(
										(exp) =>
											`export const ${exp} = (...args) => makeActionRequest(args, "${clientPath}","${exp}", ${fetcherString});`,
									),
								].join("\n"),
								loader: "js",
							};
						});
					},
				},
			],
		};
	}
	const actionBasePathRegex = new RegExp(
		`${actionBasePath.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}`,
	);
	const devPlugin: Bun.BunPlugin = {
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
							"no-action" as Directives,
							args.path,
						))
					) {
						return {
							contents:
								args.__chainedContents ?? (await Bun.file(args.path).text()),
						};
					}
					return {
						contents: wrapWithCloudFlareEventHandler(
							await Bun.file(args.path).text(),
							transpiledCloudFlareScript,
						),
						loader: "ts",
					};
				},
			);
		},
	};

	const makeDevBuild = async (entryPoint: string[]) => {
		const builder = await getGlobalPluginContext("build-unifier")?.getBuilder?.(
			PackageJson.name,
		);

		if (!builder) {
			throw new Error(
				`Builder instance not found in Cloudflare Worker Action Plugin. Make sure that "frame-master-plugin-build-unifier" is included in the plugins array and its version satisfies the requirement specified in package.json.`,
			);
		}

		if (builder.isBuilding()) return;
		else return builder.build(...entryPoint);
	};

	const createRouteMatcher = () =>
		new Bun.FileSystemRouter({
			dir: actionBasePath,
			style: "nextjs",
		});

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
	return {
		name: PackageJson.name,
		version: PackageJson.version,
		priority: -1,

		directives: [
			{
				name: "no-action",
				regex:
					/^(?:\s*(?:\/\/.*?\n|\s)*)?['"]no[-\s]action['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
			},
		],

		build: {
			buildConfig: async () => ({
				...(await createConfig()),
			}),
		},
		fileSystemWatchDir: [actionBasePath],
		async onFileSystemChange(_ev, path, absolutePath) {
			if (!absolutePath.startsWith(actionBasePath)) return;
			await mkdir(FUNCTION_DIR, { recursive: true });
			routeMatcher = createRouteMatcher();
			directiveToolSingleton.clearPaths();
			await makeDevBuild([absolutePath]);
			verboseLog(`Cloudflare Worker Action - File ${path} rebuilt`);
		},

		async createContext() {
			getGlobalPluginContext("build-unifier")?.setBuildConfig?.(
				PackageJson.name,
				{
					buildConfig: {
						outdir: join(FUNCTION_DIR),
						plugins: [devPlugin],
						splitting: true,
						sourcemap: false,
						root: actionBasePath,
						minify: false,
						naming: {
							entry: "[dir]/[name].[ext]",
						},
					},
				},
			);

			transpiledCloudFlareScript = await Bun.file(
				join(__dirname, "..", "dist", "dev", "miniflare-script.js"),
			).text();
			try {
				await rm(FUNCTION_DIR, { recursive: true, force: true });
			} catch {}
			await mkdir(FUNCTION_DIR, { recursive: true });
			routeMatcher = createRouteMatcher();
			makeDevBuild(Object.values(routeMatcher.routes));
		},
		serverStart: {
			dev_main() {
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
				const url = master.URL;
				const req = master.request;

				const targetUrl = `http://localhost:${serverPort}${url.pathname}${url.search}`;

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
			frameMasterVersion: "^3.1.3",
			bunVersion: ">=1.3.10",
			frameMasterPlugins: {
				"frame-master-plugin-build-unifier": ">=0.1.0",
			},
		},
	};
}
