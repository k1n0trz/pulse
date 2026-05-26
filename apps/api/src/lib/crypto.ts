import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const env = loadEnv();
  if (env.ENCRYPTION_KEY === "0".repeat(64) && env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production");
  }
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

// Encrypts a UTF-8 string with AES-256-GCM and returns a versioned, base64url-safe payload.
// Layout: v1.<iv>.<authTag>.<ciphertext> — all parts base64url-encoded.
export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptString(payload: string): string {
  const key = getKey();
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid ciphertext format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64!, "base64url");
  const authTag = Buffer.from(tagB64!, "base64url");
  const ciphertext = Buffer.from(ctB64!, "base64url");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext components");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
