import { describe, expect, it } from "vitest";
import { canAddAsMember, DEMO_TTL_MS, demoExpiryThreshold, demoGroupOf } from "./demo";

const real = (id: string) => ({ id, isAnonymous: false, demoOwnerId: null });
const demo = (id: string) => ({ id, isAnonymous: true, demoOwnerId: null });
const companion = (id: string, owner: string) => ({ id, isAnonymous: true, demoOwnerId: owner });

describe("demoGroupOf", () => {
  it("通常のユーザーは null、デモを開始したユーザーは自身の ID、架空のメンバーは開始したユーザーの ID", () => {
    expect(demoGroupOf(real("u1"))).toBeNull();
    expect(demoGroupOf(demo("d1"))).toBe("d1");
    expect(demoGroupOf(companion("c1", "d1"))).toBe("d1");
  });

  it("isAnonymous でなければ demoOwnerId があっても通常のユーザーとして扱う", () => {
    expect(demoGroupOf({ id: "u1", isAnonymous: false, demoOwnerId: "d1" })).toBeNull();
  });
});

describe("canAddAsMember", () => {
  it("通常のユーザーどうしは追加できる", () => {
    expect(canAddAsMember(real("u1"), real("u2"))).toBe(true);
  });

  it("デモのユーザーは自分のデモの架空のメンバーだけを追加できる", () => {
    expect(canAddAsMember(demo("d1"), companion("c1", "d1"))).toBe(true);
    expect(canAddAsMember(demo("d1"), companion("c2", "d2"))).toBe(false);
    expect(canAddAsMember(demo("d1"), demo("d2"))).toBe(false);
  });

  it("デモのユーザーは実在のユーザーを追加できない", () => {
    expect(canAddAsMember(demo("d1"), real("u1"))).toBe(false);
  });

  it("通常のユーザーはデモのユーザーを追加できない", () => {
    expect(canAddAsMember(real("u1"), demo("d1"))).toBe(false);
    expect(canAddAsMember(real("u1"), companion("c1", "d1"))).toBe(false);
  });
});

describe("demoExpiryThreshold", () => {
  it("現在時刻から有効期間（24 時間）を引いた時刻", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    expect(DEMO_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(demoExpiryThreshold(now).toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
});
