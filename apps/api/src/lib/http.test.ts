import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http.js";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns successful response without retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const response = await fetchWithRetry("https://example.com/", { retries: 2 });
    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and eventually succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const response = await fetchWithRetry("https://example.com/", { retries: 5, baseDelayMs: 1, maxDelayMs: 5 });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 400", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
    const response = await fetchWithRetry("https://example.com/", { retries: 3 });
    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After (seconds) header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const response = await fetchWithRetry("https://example.com/", { retries: 2, baseDelayMs: 1, maxDelayMs: 5 });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns the last response after exhausting retries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 502 }));
    const response = await fetchWithRetry("https://example.com/", { retries: 2, baseDelayMs: 1, maxDelayMs: 5 });
    expect(response.status).toBe(502);
  });
});
