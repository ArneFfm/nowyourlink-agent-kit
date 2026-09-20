#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  advertiserClient,
  clearTokens,
  login,
  newIdempotencyKey,
  saveTokens,
} from "./auth.js";
import { SpotlightClient } from "./sdk.js";

export const usage = `Usage:
  nowyourlink current | list [--limit 1..50] [--offset 0..10000] | day YYYY-MM-DD
  nowyourlink login [--scope "a b"] [--mandate "50 EUR/day"] | logout | me
  nowyourlink bid --day YYYY-MM-DD --ad AD_ID --amount CENTS [--bid BID_ID] [--key KEY]
  nowyourlink bids --day YYYY-MM-DD
  nowyourlink creative list [--state draft] | upload FILE [--headline T] [--description T] [--target-url URL]
  nowyourlink creative update AD_ID [--headline T] [--description T] [--target-url URL]
  nowyourlink creative submit AD_ID
  nowyourlink invoices`;

/** Parses `--flag value` pairs; every advertiser command uses this shape. */
function flags(rest, allowed) {
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const token = rest[i];
    // Only a `--name value` pair. A bare word here means the command was typed
    // with a stray or misplaced argument, which must not be read as a flag.
    if (!/^--[a-z][a-z-]*$/.test(token ?? "")) throw new TypeError(usage);
    const key = token.slice(2);
    const value = rest[i + 1];
    // An explicit empty value is legitimate (`--headline ""` clears the copy),
    // but a missing one, or the next flag read as a value, is a typing error.
    if (
      !allowed.includes(key) ||
      Object.hasOwn(options, key) ||
      value === undefined ||
      value.startsWith("--")
    )
      throw new TypeError(usage);
    options[key] = value;
  }
  return options;
}

function copyOf(options) {
  const copy = {};
  if (options.headline !== undefined) copy.headline = options.headline;
  if (options.description !== undefined) copy.description = options.description;
  if (options["target-url"] !== undefined)
    copy.targetUrl = options["target-url"];
  return copy;
}

async function fileBlob(path) {
  return { blob: new Blob([await readFile(path)]), filename: basename(path) };
}

export async function run(args, client = new SpotlightClient(), deps = {}) {
  const agent = deps.agent ?? advertiserClient;
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
  if (command === "login") {
    const options = flags(rest, ["scope", "mandate"]);
    const tokens = await (deps.login ?? login)({
      scopes: options.scope?.split(/\s+/),
      mandateHint: options.mandate,
    });
    await (deps.saveTokens ?? saveTokens)(tokens);
    return { logged_in: true, scope: tokens.scope ?? null };
  }
  if (command === "logout" && rest.length === 0) {
    await (deps.clearTokens ?? clearTokens)();
    return { logged_out: true };
  }
  if (command === "me" && rest.length === 0) return (await agent()).me();
  if (command === "invoices" && rest.length === 0)
    return (await agent()).listInvoices();
  if (command === "bids") {
    const options = flags(rest, ["day"]);
    if (options.day === undefined) throw new TypeError(usage);
    return (await agent()).listBids(options.day);
  }
  if (command === "bid") {
    const options = flags(rest, ["day", "ad", "amount", "bid", "key"]);
    const bid = {
      day: options.day,
      adId: options.ad,
      amountCents: Number(options.amount),
      idempotencyKey: options.key ?? newIdempotencyKey(),
    };
    if (!Number.isInteger(bid.amountCents)) throw new TypeError(usage);
    const api = await agent();
    return options.bid ? api.increaseBid(options.bid, bid) : api.placeBid(bid);
  }
  if (command === "creative") {
    const [action, ...tail] = rest;
    if (action === "list")
      return (await agent()).listCreatives(flags(tail, ["state", "cursor"]));
    if (action === "submit" && tail.length === 1)
      return (await agent()).submitCreative(tail[0]);
    if (action === "upload" && tail.length >= 1) {
      const [path, ...pairs] = tail;
      const options = flags(pairs, ["headline", "description", "target-url"]);
      const { blob, filename } = await fileBlob(path);
      return (await agent()).uploadCreative({
        file: blob,
        filename,
        ...copyOf(options),
      });
    }
    if (action === "update" && tail.length >= 3) {
      const [id, ...pairs] = tail;
      const options = flags(pairs, ["headline", "description", "target-url"]);
      return (await agent()).updateCreative(id, copyOf(options));
    }
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
      `${JSON.stringify({ error: error.message, status: error.status ?? 0, code: error.code ?? null })}\n`,
    );
    process.exitCode = 1;
  }
}
