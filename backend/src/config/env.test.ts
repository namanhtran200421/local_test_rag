import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateEnvironment } from "./env.js";

describe("production configuration", () => {
  it("fails closed when production identity or database settings are absent", () => {
    assert.throws(() => validateEnvironment({ NODE_ENV: "production" }));
  });

  it("rejects wildcard production CORS", () => {
    assert.throws(() => validateEnvironment({
      NODE_ENV: "production", ALLOWED_ORIGINS: "*", DATABASE_URL: "postgresql://db.example/tan",
      AUTH_JWKS_URL: "https://id.example/jwks", AUTH_ISSUER: "https://id.example/", AUTH_AUDIENCE: "tan",
    }));
  });
});
