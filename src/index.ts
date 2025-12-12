import {
  directiveToolSingleton,
  type FrameMasterPlugin,
} from "frame-master/plugin";
import PackageJson from "../package.json";
import { join } from "path";
import { mkdir } from "fs/promises";
import { getBuilder } from "frame-master/build";
import { rm } from "fs/promises";

declare global {
  var WRANGLER_PROCESS: Bun.Subprocess;
}

export type CloudFlareWorkerActionPluginOptions = {
  actionBasePath: string;
  /** Wrangler port default: 8787 */
  serverPort?: number;
  /**
   * Build output directory
   *
   * default: buildConfig.outdir
   */
  outDir: string;
};
const FUNCTION_DIR = "functions";
const cloudflareActionPluginDisplayName = "Cloudflare-action-plugin";

function wrapWithCloudFlareEventHandler(
  moduleContent: string,
  miniflareScript: string
) {
  return [moduleContent, miniflareScript].join("\n");
}

export default function createCloudFlareWorkerActionPlugin(
  props: CloudFlareWorkerActionPluginOptions
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
      })
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
        })
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
              (args) => {
                return {
                  path: join(__dirname, "bootstrap.ts"),
                  namespace: "cloudflare-client-bootstrap",
                };
              }
            );
            // Load bootstrap file
            build.onLoad(
              { filter: /.*/, namespace: "cloudflare-client-bootstrap" },
              async (args) => {
                return {
                  contents: await Bun.file(args.path).text(),
                  loader: "ts",
                };
              }
            );
            // Transpile to client action
            build.onLoad({ filter: /.*/ }, async (args) => {
              if (absoluteEntryPoints.includes(args.path) === false) {
                return;
              }
              const exports = parsedFile.find(
                (pf) => pf.filePath === args.path
              )!.actions;

              const clientPathArray = args.path
                .split(actionBasePath)
                .pop()!
                .split(".");
              clientPathArray.pop();
              let clientPath = clientPathArray.join(".").replaceAll(/\\/g, "/");

              if (clientPath.endsWith("/index")) {
                clientPath = clientPath.slice(0, -"/index".length);
              }

              return {
                contents: [
                  `import makeActionRequest from "cloudflare-worker-action/bootstrap";`,
                  ...exports.map(
                    (exp) =>
                      `export const ${exp} = (...args) => makeActionRequest(args, "${clientPath}","${exp}");`
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
    `${actionBasePath.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}`
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
            (await directiveToolSingleton.pathIs("no-action" as any, args.path))
          ) {
            return {
              contents:
                args.__chainedContents ?? (await Bun.file(args.path).text()),
            };
          }
          return {
            contents: wrapWithCloudFlareEventHandler(
              await Bun.file(args.path).text(),
              transpiledCloudFlareScript
            ),
            loader: "ts",
          };
        }
      );
    },
  };

  const makeDevBuild = async (entryPoint: string[]) => {
    const res = await Bun.build({
      outdir: join(FUNCTION_DIR),
      entrypoints: [...entryPoint],
      plugins: [devPlugin],
      splitting: false,
      sourcemap: false,
      root: actionBasePath,
      minify: false
        ? {
            keepNames: false,
            identifiers: false,
            whitespace: true,
            syntax: true,
          }
        : false,
      naming: {
        entry: "[dir]/[name].[ext]",
      },
    });
    return res;
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
      stdout: "pipe",
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

    const isReady = new Promise(async (resolve, reject) => {
      for await (const handle of proc.stdout) {
        const original_str = new TextDecoder().decode(handle);
        console.log(original_str);
        if (Bun.stripANSI(original_str).startsWith("[wrangler:info] Ready on"))
          resolve(true);
      }
    });

    return { proc, isReady };
  };

  return {
    name: "frame-master-plugin-cloudflare-worker-action",
    version: PackageJson.version,
    priority: -1,
    requirement: {
      frameMasterVersion: PackageJson.peerDependencies["frame-master"],
    },

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
    async onFileSystemChange(ev, path, absolutePath) {
      console.log(`Cloudflare Worker Action - File change detected:`, {
        ev,
        path,
        absolutePath,
      });

      if (!absolutePath.startsWith(actionBasePath)) return;
      await mkdir(FUNCTION_DIR, { recursive: true });
      routeMatcher = createRouteMatcher();
      directiveToolSingleton.clearPaths();
      await makeDevBuild([absolutePath]);

      console.log(`Cloudflare Worker Action - File ${path} rebuilt`);
    },

    async createContext() {
      transpiledCloudFlareScript = await Bun.file(
        join(__dirname, "..", "dist", "dev", "miniflare-script.js")
      ).text();
      try {
        await rm(FUNCTION_DIR, { recursive: true, force: true });
      } catch {}
      await mkdir(FUNCTION_DIR, { recursive: true });
      routeMatcher = createRouteMatcher();
      await Promise.all(
        Object.values(routeMatcher.routes)
          .map((p) => [p])
          .map(makeDevBuild)
      );
    },
    serverStart: {
      dev_main() {
        if (global.WRANGLER_PROCESS && !global.WRANGLER_PROCESS.killed) return;
        const proc = spawnWrangler();
        console.log(
          `[${cloudflareActionPluginDisplayName}] Starting Wrangler...`
        );
        global.WRANGLER_PROCESS = proc.proc;
        return proc.isReady.then(() =>
          console.log(
            `[${cloudflareActionPluginDisplayName}] Wrangler dev server is ready`
          )
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
          `Proxying request to Cloudflare Worker Action: ${req.method} ${targetUrl}`
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
  };
}
