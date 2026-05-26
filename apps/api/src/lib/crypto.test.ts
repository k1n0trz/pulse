import { describe, expect, it } from "vitest";
import { decryptString, encryptString, generateEncryptionKey } from "./crypto.js";

describe("crypto", () => {
  it("round trips a plaintext", () => {
    const cipher = encryptString("hello world");
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(decryptString(cipher)).toBe("hello world");
  });

  it("produces a fresh IV per call (ciphertexts diverge)", () => {
    const a = encryptString("same plaintext");
    const b = encryptString("same plaintext");
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe("same plaintext");
    expect(decryptString(b)).toBe("same plaintext");
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encryptString("sensitive token value");
    const parts = cipher.split(".");
    parts[3] = parts[3]!.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(() => decryptString(parts.join("."))).toThrow();
  });

  it("rejects malformed payload", () => {
    expect(() => decryptString("not.a.real.payload")).toThrow();
    expect(() => decryptString("v0.aaa.bbb.ccc")).toThrow();
  });

  it("generateEncryptionKey returns 64 hex chars", () => {
    const key = generateEncryptionKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
