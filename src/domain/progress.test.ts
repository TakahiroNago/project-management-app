import { describe, expect, it } from "vitest";
import { calculateProgress } from "./progress";

describe("calculateProgress", () => {
  it("完了数 ÷ 全体数をパーセントで返す", () => {
    expect(calculateProgress(1, 4)).toBe(25);
    expect(calculateProgress(3, 3)).toBe(100);
  });

  it("タスクが 0 件のときは 0%", () => {
    expect(calculateProgress(0, 0)).toBe(0);
  });

  it("小数点以下は切り捨てる（全完了でない限り 100% にならない）", () => {
    expect(calculateProgress(1, 3)).toBe(33);
    expect(calculateProgress(199, 200)).toBe(99);
  });

  it("異常値は範囲内に丸める", () => {
    expect(calculateProgress(-1, 4)).toBe(0);
    expect(calculateProgress(5, 4)).toBe(100);
    expect(calculateProgress(1, -1)).toBe(0);
    expect(calculateProgress(1, Number.NaN)).toBe(0);
  });
});
