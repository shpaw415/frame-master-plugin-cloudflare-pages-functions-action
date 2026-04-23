
> since v1.0.0 BuildUnifier plugin is required
```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import CloudFlareWorkerAction from "frame-master-plugin-cloudflare-pages-functions-action";
import BuildUnifier from "frame-master-plugin-build-unifier";

export default {
  plugins: [
    ...BuildUnifier({
        plugins: [
            CloudFlareWorkerAction({
                actionBasePath: "src/actions", // Directory containing your actions
                outDir: ".frame-master/build", // Build output directory
                serverPort: 8787, // Optional: Wrangler dev server port (default: 8787)
            }),
            // ... other plugins that modify the build step of cloudflare functions.
        ]
    })
    // ... other plugins
  ],
} satisfies FrameMasterConfig;

```