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
