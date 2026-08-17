> Isolated functions builds need `BuildUnifier` from `frame-master/plugin` (legacy `frame-master-plugin-build-unifier` still works).

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import { BuildUnifier } from "frame-master/plugin";
import CloudFlareWorkerAction from "frame-master-plugin-cloudflare-pages-functions-action";

export default {
  plugins: [
    ...BuildUnifier({
      id: "cf-actions",
      plugins: [
        CloudFlareWorkerAction({
          actionBasePath: "src/actions",
          outDir: ".frame-master/build",
          serverPort: 8787,
        }),
      ],
    }),
  ],
} satisfies FrameMasterConfig;
```
