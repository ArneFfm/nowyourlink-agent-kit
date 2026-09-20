import type { AdvertiserClient, AdvertiserClientOptions } from "./sdk.js";

export const ISSUER: string;
export const CLIENT_ID: string;
export const SCOPES: string[];
export interface Tokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  client_id?: string;
  issuer?: string;
}
export function pkcePair(): { verifier: string; challenge: string };
export function parseCallback(url: string, expectedState: string): string;
export function tokenFile(): string;
export function saveTokens(tokens: Tokens, file?: string): Promise<string>;
export function loadTokens(file?: string): Promise<Tokens | null>;
export function clearTokens(file?: string): Promise<void>;
export function login(options?: {
  clientId?: string;
  scopes?: string[];
  mandateHint?: string;
  issuer?: string;
  fetch?: typeof globalThis.fetch;
  open?: (url: string) => unknown;
  log?: (line: string) => unknown;
}): Promise<Tokens>;
export function refreshTokens(options: {
  refreshToken?: string;
  clientId?: string;
  issuer?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<Tokens>;
export function advertiserClient(
  options?: Partial<AdvertiserClientOptions> & { file?: string },
): Promise<AdvertiserClient>;
export function newIdempotencyKey(): string;
