# Frame Master Plugin - Cloudflare Pages Functions Action

[![npm version](https://img.shields.io/npm/v/frame-master-plugin-cloudflare-pages-functions-action.svg)](https://www.npmjs.com/package/frame-master-plugin-cloudflare-pages-functions-action)
[![License](https://img.shields.io/npm/l/frame-master-plugin-cloudflare-pages-functions-action.svg)](LICENSE)

A Frame Master plugin that brings **type-safe server actions** to Cloudflare Pages. Write server-side functions that can be called from the client as async functions with full TypeScript type safety - similar to server actions in modern frameworks.

## ✨ Features

- 🔒 **End-to-End Type Safety** - Full TypeScript support from server to client
- 🚀 **Zero Configuration** - Automatically compiles actions on file changes
- 🌐 **Cloudflare Native** - Built specifically for Cloudflare Pages Functions
- 📦 **Multiple Data Types** - Support for JSON, Files, FormData, and Blobs
- 🔄 **Hot Reload** - Automatic rebuilds during development
- 🎯 **Simple API** - Call server functions like any async function

## 📦 Installation

```bash
bun add frame-master-plugin-cloudflare-pages-functions-action
```

or

```bash
npm install frame-master-plugin-cloudflare-pages-functions-action
```

## 🚀 Quick Start

### 1. Configure the Plugin

Add the plugin to your `frame-master.config.ts`:

```typescript
import CloudFlareWorkerAction from "frame-master-plugin-cloudflare-pages-functions-action";
import type { FrameMasterConfig } from "frame-master/server/types";

export default {
  plugins: [
    CloudFlareWorkerAction({
      actionBasePath: "src/actions", // Directory containing your actions
      outDir: ".frame-master/build", // Build output directory
      serverPort: 8787, // Optional: Wrangler dev server port (default: 8787)
    }),
    // ... other plugins
  ],
} satisfies FrameMasterConfig;
```

### 2. Create a Server Action

Create a file at `src/actions/user/profile.ts`:

```typescript
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

export async function GET() {
  const ctx = getContext(arguments);

  // Access Cloudflare environment
  const user = await ctx.env.KV.get("current-user");

  return {
    name: "John Doe",
    email: "john@example.com",
  } as const;
}

export async function POST(
  userId: string,
  data: { name: string; email: string }
) {
  const ctx = getContext(arguments);

  // Save to Cloudflare KV
  await ctx.env.KV.put(`user:${userId}`, JSON.stringify(data));

  return {
    success: true,
    userId,
  } as const;
}
```

### 3. Call from Client

Import and use the action in your client code:

```typescript
import {
  GET as getProfile,
  POST as updateProfile,
} from "src/actions/user/profile";

// Fully type-safe function calls
const profile = await getProfile();
console.log(profile.name); // TypeScript knows this exists!

const result = await updateProfile("123", {
  name: "Jane Doe",
  email: "jane@example.com",
});
console.log(result.success); // Type-safe!
```

## 📖 Detailed Usage

### HTTP Methods

Export functions with HTTP method names to create different endpoints:

```typescript
export async function GET() {
  // Handle GET requests
}

export async function POST(...args) {
  // Handle POST requests
}

export async function PUT(...args) {
  // Handle PUT requests
}

export async function DELETE(...args) {
  // Handle DELETE requests
}

export async function PATCH(...args) {
  // Handle PATCH requests
}
```

### Accessing Cloudflare Context

Use the `getContext()` helper to access the Cloudflare environment:

```typescript
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";
import type { EventContext } from "@cloudflare/workers-types";

export async function POST(userId: string) {
  const ctx = getContext<Env, string, Data>(arguments);

  // Access environment bindings
  await ctx.env.KV.put("key", "value");
  await ctx.env.DB.prepare("SELECT * FROM users").all();

  // Access request context
  const country = ctx.request.cf?.country;

  // Access data passed through Cloudflare
  console.log(ctx.data);

  return { success: true };
}
```

### Data Types Support

#### JSON Data

```typescript
// Server
export async function POST(user: { name: string; age: number }) {
  return { received: user };
}

// Client
const result = await POST({ name: "Alice", age: 30 });
```

#### File Upload

```typescript
// Server
export async function POST(file: File) {
  const ctx = getContext(arguments);
  const buffer = await file.arrayBuffer();
  await ctx.env.R2.put(`uploads/${file.name}`, buffer);

  return { filename: file.name, size: file.size };
}

// Client
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const result = await POST(file);
```

#### Multiple Files

```typescript
// Server
export async function POST(files: File[]) {
  return { count: files.length };
}

// Client
const files = Array.from(fileInput.files);
const result = await POST(files);
```

#### FormData

```typescript
// Server
export async function POST(formData: FormData) {
  const name = formData.get("name");
  const file = formData.get("avatar") as File;

  return { name, hasFile: !!file };
}

// Client
const formData = new FormData();
formData.append("name", "John");
formData.append("avatar", file);
const result = await POST(formData);
```

#### Returning Files/Blobs

```typescript
// Server
export async function GET() {
  const ctx = getContext(arguments);
  const file = await ctx.env.R2.get("document.pdf");

  return new File([await file.arrayBuffer()], "document.pdf", {
    type: "application/pdf",
  });
}

// Client
const file = await GET();
const url = URL.createObjectURL(file);
```

### File Organization

Actions follow a Next.js-style file-based routing:

```
src/actions/
├── user/
│   ├── profile.ts      → /user/profile
│   └── settings.ts     → /user/settings
├── auth/
│   ├── login.ts        → /auth/login
│   └── logout.ts       → /auth/logout
└── api/
    └── data.ts         → /api/data
```

## ⚙️ Configuration Options

| Option           | Type     | Required | Default | Description                            |
| ---------------- | -------- | -------- | ------- | -------------------------------------- |
| `actionBasePath` | `string` | ✅       | -       | Directory containing your action files |
| `outDir`         | `string` | ✅       | -       | Build output directory                 |
| `serverPort`     | `number` | ❌       | `8787`  | Wrangler dev server port               |

## 🔧 Development

### Local Development

During development, the plugin:

1. Watches your action files for changes
2. Automatically rebuilds modified actions
3. Proxies requests to Wrangler dev server
4. Provides hot reload functionality

### Building for Production

When you build your Frame Master project, the plugin:

1. Scans all action files
2. Generates type-safe client wrappers
3. Compiles server-side functions
4. Outputs to the configured `outDir`

## 📚 Examples

### Authentication Flow

```typescript
// src/actions/auth/login.ts
import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

export async function POST(email: string, password: string) {
  const ctx = getContext(arguments);

  // Verify credentials
  const user = await ctx.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (!user || user.password !== password) {
    throw new Error("Invalid credentials");
  }

  // Create session
  const sessionId = crypto.randomUUID();
  await ctx.env.KV.put(`session:${sessionId}`, user.id, {
    expirationTtl: 86400, // 24 hours
  });

  return {
    success: true,
    sessionId,
    user: { id: user.id, email: user.email },
  } as const;
}
```

```typescript
// Client usage
import { POST as login } from "src/actions/auth/login";

async function handleLogin(email: string, password: string) {
  try {
    const result = await login(email, password);
    localStorage.setItem("sessionId", result.sessionId);
    console.log("Logged in as:", result.user.email);
  } catch (error) {
    console.error("Login failed:", error);
  }
}
```

### File Upload with Progress

```typescript
// src/actions/upload/image.ts
export async function POST(
  file: File,
  metadata: { title: string; tags: string[] }
) {
  const ctx = getContext(arguments);

  // Upload to R2
  await ctx.env.R2.put(`images/${file.name}`, file);

  // Save metadata to D1
  await ctx.env.DB.prepare(
    "INSERT INTO images (filename, title, tags) VALUES (?, ?, ?)"
  )
    .bind(file.name, metadata.title, JSON.stringify(metadata.tags))
    .run();

  return {
    url: `/images/${file.name}`,
    size: file.size,
  } as const;
}
```

```typescript
// Client usage
import { POST as uploadImage } from "src/actions/upload/image";

async function handleUpload(file: File) {
  const result = await uploadImage(file, {
    title: "My Image",
    tags: ["vacation", "summer"],
  });

  console.log("Uploaded to:", result.url);
}
```

## 🛠️ TypeScript Support

The plugin provides full TypeScript support with proper type exports:

```typescript
import type { CloudFlareWorkerActionPluginOptions } from "frame-master-plugin-cloudflare-pages-functions-action/types";
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project follows the same license as Frame Master.

## 🔗 Related

- [Frame Master](https://github.com/shpaw415/frame-master) - The main framework
- [Cloudflare Pages](https://pages.cloudflare.com/) - Deployment platform
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless platform

## 📖 Documentation

For more information about Frame Master and its plugin system, visit the [Frame Master documentation](https://github.com/shpaw415/frame-master).

## 🐛 Issues

If you encounter any issues, please [open an issue](https://github.com/shpaw415/frame-master-plugin-cloudflare-pages-functions-action/issues) on GitHub.

---

Made with ❤️ for the Frame Master ecosystem
