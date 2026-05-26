// Deterministic test environment.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-test-jwt-secret-test-jwt-secret-test";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0".repeat(63) + "1"; // valid 64-hex
