# Copilot Instructions for Cloudflare Pages Functions Action Plugin

## Project Overview

This is a **Frame Master plugin** that enables type-safe server actions for Cloudflare Pages Functions. It transpiles server-side action files into client-callable async functions with full TypeScript type inference.

## Architecture

### Core Data Flow

1. **Build Time**: Actions in `actionBasePath` are scanned → exports extracted → client stubs generated that call `bootstrap.ts`
2. **Dev Time**: Wrangler runs locally, action files wrapped with `miniflare-script.ts` handler → requests proxied from Frame Master to Wrangler
3. **Runtime**: Client calls action → `bootstrap.ts` serializes args to FormData → fetch to Cloudflare → `functions-bootstrap.ts` deserializes & invokes handler

### Key Files

- [src/index.ts](src/index.ts) - Plugin entry: Bun build plugins, wrangler spawning, file watching, request proxying
- [src/bootstrap.ts](src/bootstrap.ts) - **Client-side**: Serializes args (Files, JSON, FormData) and parses responses
- [src/functions-bootstrap.ts](src/functions-bootstrap.ts) - **Server-side (Cloudflare)**: Deserializes FormData, invokes action, formats response
- [src/dev/miniflare-script.ts](src/dev/miniflare-script.ts) - Wraps action exports with `onRequest` handler for Wrangler

## Conventions

### Action File Pattern

Actions export HTTP method-named functions. Context is **always the last argument** via `getContext(arguments)`:

```typescript
// src/actions/user.ts
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

export async function POST(userId: string, data: { name: string }) {
  const ctx = getContext(arguments); // Access env, request, etc.
  return { success: true };
}
```

### Directive: `"no action"`

Files starting with `"no action";` are excluded from action transpilation (used for raw Cloudflare Pages Functions):

```typescript
"no action";
export async function onRequestGet(params) { ... }
```

### Supported Data Types

- **Input**: JSON, File, File[], FormData (single only)
- **Output**: JSON, Blob, File, Response (with `dataType` header)

## Development Workflow

### Build the miniflare script (required before testing)

```bash
bun run build:bootstrap
```

This compiles `src/dev/miniflare-script.ts` → `dist/dev/miniflare-script.js`

### Testing with test-project

```bash
cd test-project
bun install
bun run dev  # Starts Frame Master with this plugin
```

### Plugin Configuration (in consumer's frame-master.config.ts)

```typescript
ServerAction({
  actionBasePath: "src/actions", // Where action files live
  outDir: ".frame-master/build", // Build output
  serverPort: 8787, // Wrangler dev port
});
```

## Important Patterns

### Bun Build Plugin Chain

The plugin uses two Bun plugins:

1. **Build time** (`createConfig`): Rewrites action files to client stubs importing bootstrap
2. **Dev time** (`devPlugin`): Appends miniflare handler to action files for Wrangler

### Request Proxying

In dev, requests with `x-server-action: true` header are proxied from Frame Master (port 3001) to Wrangler (port 8787).

### FormData Serialization Protocol

Args encoded with prefixes: `FILE_n`, `FILES_n` (batched), `JSON_n` - parsed in `functions-bootstrap.ts`
