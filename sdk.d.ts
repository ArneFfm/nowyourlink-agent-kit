export interface Spotlight {
  day: string;
  headline: string;
  description: string;
  advertiser: string;
  canonicalUrl: string;
  contentType: "house_advertisement" | "paid_advertisement";
}
export interface SpotlightResponse { data: Spotlight }
export interface SpotlightListResponse { data: Spotlight[]; nextOffset: number | null }
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
  list(options?: { limit?: number; offset?: number }): Promise<SpotlightListResponse>;
  day(day: string): Promise<SpotlightResponse>;
}
