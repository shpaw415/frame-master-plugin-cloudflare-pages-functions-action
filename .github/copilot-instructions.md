# Frame-Master Plugin Creation Helper

## Overview

This guide helps Copilot assist with creating Frame-Master plugins. Frame-Master is a **plugin-first meta-framework for Bun.js** where plugins define all behavior including routing, SSR, building, and more.

## Quick Start Template

```typescript
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { name, version } from "package.json";

export default function myPlugin(options?: MyPluginOptions): FrameMasterPlugin {
  return {
    name,
    version,
    priority: 100, // Lower = higher priority (0 runs first) (optional, recommended only if necessary)

    // Add hooks as needed...
  };
}
```

## Plugin Structure

### Required Fields

| Field     | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `name`    | `string` | Unique plugin identifier                 |
| `version` | `string` | Semantic version for dependency checking |

### Optional Fields

| Field                | Type       | Description                                   |
| -------------------- | ---------- | --------------------------------------------- |
| `priority`           | `number`   | Execution order (lower = first, default: 100) |
| `router`             | `object`   | Request lifecycle hooks                       |
| `build`              | `object`   | Build pipeline hooks                          |
| `serverStart`        | `object`   | Server startup hooks                          |
| `requirement`        | `object`   | Version requirements                          |
| `websocket`          | `object`   | WebSocket handlers                            |
| `directives`         | `array`    | Custom file directives                        |
| `fileSystemWatchDir` | `array`    | Directories to watch (dev only)               |
| `onFileSystemChange` | `function` | File change handler (dev only)                |
| `onConfigReload`     | `function` | Config reload handler (dev only)              |
| `createContext`      | `function` | Plugin initialization                         |
| `runtimePlugins`     | `array`    | Bun plugins for runtime                       |
| `serverConfig`       | `object`   | Bun server configuration                      |

## Request Lifecycle Hooks

### Hook Execution Order

```
before_request → request → after_request → html_rewrite
```

### `router.before_request`

Pre-process requests, initialize context, read cookies.

```typescript
router: {
  before_request: async (master) => {
    // Initialize shared context
    const session = master.getCookie<{ userId: string }>("session", true);
    master.setContext({ session });

    // Set global values accessible on client
    master.setGlobalValues({ __USER_ID__: session?.userId });
  },
}
```

### `router.request`

Handle the request and set response. Only ONE plugin should set the response.

```typescript
router: {
  request: async (master) => {
    // Check if this plugin should handle the route
    if (master.URL.pathname.startsWith("/api/my-plugin")) {
      const data = await fetchData();
      master.setResponse(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
      master.sendNow(); // Skip remaining request plugins
    }
  },
}
```

### `router.after_request`

Modify response headers, set cookies after response is created.

```typescript
router: {
  after_request: async (master) => {
    // Only runs if response exists
    if (master.response) {
      master.response.headers.set("X-Plugin-Version", "1.0.0");

      // Set cookie with encryption
      const context = master.getContext<{ newSession: object }>();
      if (context.newSession) {
        master.setCookie("session", context.newSession, {
          httpOnly: true,
          encrypted: true,
          maxAge: 86400
        });
      }
    }
  },
}
```

### `router.html_rewrite`

Transform HTML responses using `HTMLRewriter`.

```typescript
router: {
  html_rewrite: {
    initContext: (master) => ({ timestamp: Date.now() }),

    rewrite: (rewriter, master, ctx) => {
      rewriter.on("head", {
        element(el) {
          el.append(`<meta name="generated" content="${ctx.timestamp}">`, { html: true });
        }
      });

      rewriter.on("body", {
        element(el) {
          el.append(`<script>console.log("Plugin loaded")</script>`, { html: true });
        }
      });
    },

    after: (html, master, ctx) => {
      // Access final HTML string if needed
      console.log(`HTML generated in ${Date.now() - ctx.timestamp}ms`);
    }
  },
}
```

## masterRequest API Reference

### Response Methods

```typescript
// Set response body and options
master.setResponse(body: BodyInit | null, init?: ResponseInit)

// Skip remaining request plugins, proceed to after_request
master.sendNow()

// Check if response is already set
master.isResponseSetted(): boolean

// Unset previously set response
master.unsetResponse()
```

### Context Methods

```typescript
// Share data between hooks within same request
master.setContext({ key: "value" });
master.getContext<{ key: string }>();
```

### Cookie Methods

```typescript
// Get cookie (with optional decryption)
master.getCookie<T>("name", encrypted?: boolean): T | undefined

// Set cookie (written in after_request)
master.setCookie("name", data, options?: CookieOptions, dataOptions?: SetDataOptions)

// Delete cookie
master.deleteCookie("name", options?: DeleteCookieOptions)
```

### Header Methods

```typescript
// Set response header
master.setHeader("X-Custom", "value");
```

### Global Values

```typescript
// Inject values accessible on client via globalThis
declare global {
  var __MY_VALUE__: string;
}
master.setGlobalValues({ __MY_VALUE__: "data" });

// Prevent injection (for static assets, etc.)
master.preventGlobalValuesInjection();
```

### Request Properties

```typescript
master.request; // Original Request object
master.URL; // Parsed URL object
master.isAskingHTML; // True if browser requests HTML
master.isStaticAsset; // True if serving static file
master.currentState; // "before_request" | "request" | "after_request"
master.serverConfig; // Frame-Master configuration
master.serverInstance; // Bun.Server instance
```

## Build Pipeline Hooks

### Singleton Builder Pattern

All plugins contribute to ONE unified build. Import the builder to trigger builds:

```typescript
import { builder } from "frame-master/build";

// In serverStart.main or elsewhere
await builder.build("/src/client.tsx");
```

### `build.buildConfig`

**Static Configuration** (merged once on import):

```typescript
build: {
  buildConfig: {
    external: ["react", "react-dom"],
    target: "browser",
    minify: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production")
    }
  }
}
```

**Dynamic Configuration** (called on each build):

```typescript
build: {
  buildConfig: async (builder) => ({
    external: builder.isLogEnabled ? ["debug-lib"] : [],
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : "external",
    plugins: [myCustomBunPlugin()],
  });
}
```

### `build.beforeBuild`

Runs before `Bun.build()` is called:

```typescript
build: {
  beforeBuild: async (buildConfig, builder) => {
    console.log(`Building ${buildConfig.entrypoints?.length} entrypoints`);

    // Clean output directory
    await Bun.$`rm -rf ${buildConfig.outdir}/*`;

    // Generate build manifest
    await Bun.write(
      ".frame-master/build-info.json",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        entrypoints: buildConfig.entrypoints,
      })
    );
  };
}
```

### `build.afterBuild`

Runs after build completes:

```typescript
build: {
  afterBuild: async (buildConfig, result, builder) => {
    if (!result.success) {
      console.error("Build failed:", result.logs);
      return;
    }

    console.log("Build successful!");

    // Analyze outputs
    const analysis = builder.analyzeBuild();
    if (analysis.totalSize > 1_000_000) {
      console.warn("Bundle exceeds 1MB:", analysis.totalSize);
    }

    // Log generated files
    for (const output of result.outputs) {
      console.log(`  ${output.path} (${output.size} bytes)`);
    }
  };
}
```

Add file to the buildOutputs:

```typescript
build: {
  afterBuild: async (buildConfig, result, builder) => {
    result.outputs.push({
      ...Bun.file("./public/special-file.txt"),
      path: join(process.cwd(), "public/special-file.txt"),
      loader: "text",
      hash: "",
      kind: "asset",
      sourcemap: null,
    });
  };
}
```

### Config Merging Rules

| Type                               | Strategy                               |
| ---------------------------------- | -------------------------------------- |
| Arrays (`external`, `entrypoints`) | Deduplicated + concatenated            |
| Objects (`define`, `loader`)       | Deep merged                            |
| Plugins array                      | Concatenated (order preserved)         |
| Primitives                         | Last plugin wins (warning on conflict) |

## Server Lifecycle Hooks

### `serverStart.main`

Runs once on main thread at server start:

```typescript
serverStart: {
  main: async () => {
    console.log("Plugin initialized");
    await connectToDatabase();

    // Build client code
    const { builder } = await import("frame-master/build");
    await builder.build("./src/client.tsx");
  };
}
```

### `serverStart.dev_main`

Runs only in development mode:

```typescript
serverStart: {
  dev_main: async () => {
    console.log("Development mode - enabling hot reload");
    setupDevTools();
  };
}
```

## Plugin Requirements

Declare dependencies and version constraints:

```typescript
requirement: {
  frameMasterVersion: "^3.0.0",
  bunVersion: ">=1.2.0",
  frameMasterPlugins: {
    "frame-master-router": "^2.0.0",
    "some-other-plugin": "^1.0.0"
  }
}
```

## WebSocket Support

Handle WebSocket connections:

```typescript
serverConfig: {
  routes: {
    "/ws/my-plugin": (req, server) => {
      return server.upgrade(req, { data: { "my-plugin": true } });
    }
  }
},
websocket: {
  onOpen: (ws) => {
    if (ws.data?.["my-plugin"]) {
      console.log("My plugin WebSocket connected");
    }
  },
  onMessage: (ws, message) => {
    if (ws.data?.["my-plugin"]) {
      ws.send(`Echo: ${message}`);
    }
  },
  onClose: (ws) => {
    if (ws.data?.["my-plugin"]) {
      console.log("My plugin WebSocket disconnected");
    }
  }
}
```

## Custom Directives

Define file directives for build-time processing:

```typescript
import {
  directiveToolSingleton,
  type FrameMasterPlugin,
} from "frame-master/plugin";

// Extend type definitions
declare module "frame-master/plugin/utils" {
  interface CustomDirectives {
    "use-my-directive": true;
  }
}

// In plugin
directives: [
  {
    name: "use-my-directive",
    regex:
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]my-directive['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
  },
];

build: {
  buildConfig: async (builder) => ({
    plugins: [
      {
        name: "my-directive-plugin",
        setup(build) {
          build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
            const isDirective = directiveToolSingleton.pathIs(
              "use-my-directive",
              args.path
            );

            if (!isDirective) return;
            // Custom processing logic here
          });
        },
      },
    ],
  });
}

// ./src/directived-file.ts
("use-my-directive");
console.log("This file uses my custom directive");
```

## File System Watching (Dev Only)

Watch directories and react to changes:

```typescript
fileSystemWatchDir: ["./src", "./templates"],

// absolutePath from project root
onFileSystemChange: async (eventType, filePath, absolutePath) => {
  if (eventType === "change" && filePath.endsWith(".template")) {
    console.log(`Template changed: ${filePath}`);
    await regenerateFromTemplate(absolutePath);
  }
}
```

## Plugin Initialization

Initialize plugin state after server setup:

```typescript
createContext: async (config) => {
  console.log(`Initializing on port ${config.HTTPServer.port}`);
  await initializePluginState(config);
};
```

## Common Patterns

### Route Matching Helper

```typescript
import { onRoute } from "frame-master/utils";

router: {
  request: async (master) => {
    onRoute(master, {
      "/api/some_path": {
        GET(master) {
          // do something
        },
        POST(master) {
          // do something else
        },
      },
    });
  };
}
```

### Error Handling

```typescript
router: {
  request: async (master) => {
    try {
      const result = await riskyOperation();
      master.setResponse(JSON.stringify(result));
    } catch (error) {
      master.setResponse(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
```

### Plugin with Options

```typescript
interface MyPluginOptions {
  prefix?: string;
  debug?: boolean;
}

export default function myPlugin(
  options: MyPluginOptions = {}
): FrameMasterPlugin {
  const { prefix = "/api", debug = false } = options;

  return {
    name: "my-plugin",
    version: "1.0.0",
    router: {
      request: async (master) => {
        if (master.URL.pathname.startsWith(prefix)) {
          if (debug) console.log(`Handling: ${master.URL.pathname}`);
          // Handle request...
        }
      },
    },
  };
}
```

## Imports Reference

```typescript
// Plugin types
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import type { masterRequest } from "frame-master/server/request";

// Build utilities
import { builder, defineBuildConfig } from "frame-master/build";

// Utility functions
import { onRoute, verboseLog } from "frame-master/utils";

// Directive helpers
import { createDirective } from "frame-master/plugin/utils";
```

## Testing Plugins

Use Bun's native test runner:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import myPlugin from "./my-plugin";

describe("myPlugin", () => {
  test("should have correct name", () => {
    const plugin = myPlugin();
    expect(plugin.name).toBe("my-plugin");
  });

  test("should handle routes", async () => {
    const plugin = myPlugin({ prefix: "/test" });
    // Create mock masterRequest and test...
  });
});
```

## Best Practices

1. **Always set a unique `name`** - Avoid conflicts with other plugins
2. **Use semantic versioning** - Required for dependency checks
3. **Set appropriate `priority`** - Lower numbers run first
4. **Don't set response in `before_request`** - Use `request` hook instead
5. **Check `master.isResponseSetted()`** - Avoid throwing error when response is set
6. **Use `sendNow()` sparingly** - Only when you're certain no other plugin should process
7. **Clean up in `onConfigReload`** - Handle dev mode config reloads
8. **Use context for cross-hook data** - Don't rely on closures or globals
9. **Check `ws.data` in WebSocket handlers** - Multiple plugins share WebSocket events
10. **Use `verboseLog()` for debug output** - Controlled by `-v` flag
