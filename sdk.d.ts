export interface Spotlight {
  day: string;
  headline: string;
  description: string;
  advertiser: string;
  canonicalUrl: string;
  contentType: "house_advertisement" | "paid_advertisement";
}
export interface SpotlightResponse {
  data: Spotlight;
}
export interface SpotlightListResponse {
  data: Spotlight[];
  nextOffset: number | null;
}
export interface SpotlightClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export class SpotlightError extends Error {
  constructor(message: string, status?: number);
  status: number;
}
export class SpotlightClient {
  constructor(options?: SpotlightClientOptions);
  current(): Promise<SpotlightResponse>;
  list(options?: {
    limit?: number;
    offset?: number;
  }): Promise<SpotlightListResponse>;
  day(day: string): Promise<SpotlightResponse>;
}
export class AgentError extends Error {
  constructor(
    message: string,
    status?: number,
    code?: string | null,
    retryAfter?: number | null,
  );
  status: number;
  code: string | null;
  retryAfter: number | null;
}
export interface AdvertiserClientOptions {
  baseUrl?: string;
  accessToken: string;
  refresh?: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export interface CreativeCopy {
  headline?: string | null;
  description?: string | null;
  body?: string | null;
  targetUrl?: string | null;
  displayUrl?: string | null;
  ctaLabel?: string | null;
  altText?: string;
}
export interface BidInput {
  day: string;
  adId: string;
  amountCents: number;
  currency?: "EUR";
  idempotencyKey: string;
}
export class AdvertiserClient {
  constructor(options: AdvertiserClientOptions);
  me(): Promise<unknown>;
  listBids(day: string): Promise<unknown>;
  placeBid(bid: BidInput): Promise<unknown>;
  increaseBid(bidId: string, bid: BidInput): Promise<unknown>;
  listCreatives(options?: {
    cursor?: string;
    state?: string;
  }): Promise<unknown>;
  getCreative(id: string): Promise<unknown>;
  uploadCreative(
    input: CreativeCopy & { file?: Blob; url?: string; filename?: string },
  ): Promise<{ ad_id: string; asset_id: string; deduped: boolean }>;
  updateCreative(id: string, patch: CreativeCopy): Promise<unknown>;
  submitCreative(id: string): Promise<unknown>;
  listInvoices(): Promise<unknown>;
}
