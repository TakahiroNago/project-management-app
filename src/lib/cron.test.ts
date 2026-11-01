import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron";

const SECRET = "x".repeat(32);

describe("isAuthorizedCronRequest", () => {
  it("Bearer と CRON_SECRET が一致すれば許可する", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("値が違う・形式が違う・ヘッダーが無い場合は拒否する", () => {
    expect(isAuthorizedCronRequest(`Bearer ${"y".repeat(32)}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET} `, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
  });

  it("CRON_SECRET が未設定・短すぎる場合は常に拒否する", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${"x".repeat(31)}`, "x".repeat(31))).toBe(false);
  });
});
