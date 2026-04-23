```typescript
// src/actions/user/profile.ts

import { getContext } from "frame-master-plugin-cloudflare-pages-functions-action/context";

// create your action
export async function GET() {
  const ctx = getContext<globalThis.Clouflare.Env, any, any>(arguments);

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

// src/index.ts
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