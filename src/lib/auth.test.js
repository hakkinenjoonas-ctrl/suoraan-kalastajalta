import { describe, expect, it } from "vitest";

import { isMissingRefreshTokenError } from "./auth.js";

describe("auth", () => {
  describe("isMissingRefreshTokenError", () => {
    it("detects invalid refresh token errors", () => {
      expect(isMissingRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toBe(true);
    });

    it("detects refresh token not found text directly", () => {
      expect(isMissingRefreshTokenError("refresh token not found")).toBe(true);
    });

    it("ignores unrelated auth errors", () => {
      expect(isMissingRefreshTokenError(new Error("Email rate limit exceeded"))).toBe(false);
    });
  });
});
