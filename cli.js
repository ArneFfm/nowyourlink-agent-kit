#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SpotlightClient } from "./sdk.js";

export const usage =
  "Usage: nowyourlink current | list [--limit 1..50] [--offset 0..10000] | day YYYY-MM-DD";
export async function run(args, client = new SpotlightClient()) {
  const [command, ...rest] = args;
  if (command === "--help" && rest.length === 0) return usage;
  if (command === "current" && rest.length === 0) return client.current();
  if (command === "day" && rest.length === 1) return client.day(rest[0]);
  if (command === "list") {
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
      const key = rest[i].slice(2);
      if (
        !["--limit", "--offset"].includes(rest[i]) ||
        Object.hasOwn(options, key) ||
        !/^\d+$/.test(rest[i + 1] ?? "")
      )
        throw new TypeError(usage);
      options[key] = Number(rest[i + 1]);
    }
    return client.list(options);
  }
  throw new TypeError(usage);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(
      `${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: error.message, status: error.status ?? 0 })}\n`,
    );
    process.exitCode = 1;
  }
}
