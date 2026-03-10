import type { FrameMasterConfig } from "frame-master/server/types";
import ServerAction from "frame-master-plugin-cloudflare-pages-functions-action";

export default {
  HTTPServer: {
    port: 3001,
  },
  plugins: [
    ServerAction({
      outDir: ".frame-master/build",
      actionBasePath: "src/action",
      customFetch: (url, init) => {
        const header = new Headers(init?.headers);
        header.set(
          "x-custom-header",
          "This is a custom header added by the custom fetch function!",
        );
        const modifiedInit = {
          ...init,
          headers: header,
        };
        return fetch(url, modifiedInit);
      },
    }),
    {
      name: "test-plugin",
      version: "1.0.0",
      build: {
        buildConfig: {
          entrypoints: ["index.ts"],
        },
      },
    },
  ],
} satisfies FrameMasterConfig;
