import type { EventContext } from "@cloudflare/workers-types";

export function getContext<Env, P extends string, Data>(
  args: IArguments
): EventContext<Env, P, Data> {
  const len = args.length;
  return args[len - 1] as EventContext<Env, P, Data>;
}
