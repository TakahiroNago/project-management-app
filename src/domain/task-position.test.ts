import { describe, expect, it } from "vitest";
import {
  diffPositions,
  findColumn,
  groupIntoColumns,
  moveTaskInColumns,
  type PositionedTask,
} from "./task-position";

const tasks: PositionedTask[] = [
  { id: "a", status: "TODO", position: 0 },
  { id: "b", status: "TODO", position: 1 },
  { id: "c", status: "TODO", position: 2 },
  { id: "x", status: "IN_PROGRESS", position: 0 },
];

describe("groupIntoColumns", () => {
  it("列ごとに position 順で並べる", () => {
    const shuffled = [tasks[2], tasks[3], tasks[0], tasks[1]];
    expect(groupIntoColumns(shuffled)).toEqual({ TODO: ["a", "b", "c"], IN_PROGRESS: ["x"], DONE: [] });
  });

  it("position が重複・欠番していても安定して並べる", () => {
    const messy: PositionedTask[] = [
      { id: "p", status: "DONE", position: 5 },
      { id: "q", status: "DONE", position: 2 },
      { id: "r", status: "DONE", position: 2 },
    ];
    expect(groupIntoColumns(messy).DONE).toEqual(["q", "r", "p"]);
  });
});

describe("moveTaskInColumns", () => {
  const columns = groupIntoColumns(tasks);

  it("同じ列の中で並べ替える", () => {
    expect(moveTaskInColumns(columns, "c", "TODO", 0).TODO).toEqual(["c", "a", "b"]);
    expect(moveTaskInColumns(columns, "a", "TODO", 2).TODO).toEqual(["b", "c", "a"]);
  });

  it("別の列の指定位置に移動する", () => {
    const next = moveTaskInColumns(columns, "b", "IN_PROGRESS", 0);
    expect(next.TODO).toEqual(["a", "c"]);
    expect(next.IN_PROGRESS).toEqual(["b", "x"]);
  });

  it("空の列にも移動できる", () => {
    expect(moveTaskInColumns(columns, "a", "DONE", 0).DONE).toEqual(["a"]);
  });

  it("範囲外の位置は端に丸める（Infinity は末尾）", () => {
    expect(moveTaskInColumns(columns, "a", "IN_PROGRESS", 99).IN_PROGRESS).toEqual(["x", "a"]);
    expect(moveTaskInColumns(columns, "a", "IN_PROGRESS", -5).IN_PROGRESS).toEqual(["a", "x"]);
    expect(moveTaskInColumns(columns, "a", "IN_PROGRESS", Infinity).IN_PROGRESS).toEqual(["x", "a"]);
  });

  it("元の並びは変更しない", () => {
    moveTaskInColumns(columns, "a", "DONE", 0);
    expect(columns).toEqual({ TODO: ["a", "b", "c"], IN_PROGRESS: ["x"], DONE: [] });
  });

  it("存在しないタスクは例外", () => {
    expect(() => moveTaskInColumns(columns, "zzz", "DONE", 0)).toThrow();
  });
});

describe("findColumn", () => {
  it("タスクの列を返す", () => {
    const columns = groupIntoColumns(tasks);
    expect(findColumn(columns, "x")).toBe("IN_PROGRESS");
    expect(findColumn(columns, "none")).toBeNull();
  });
});

describe("diffPositions", () => {
  it("変化したタスクだけを返し、列内は 0 始まりの連番になる", () => {
    const next = moveTaskInColumns(groupIntoColumns(tasks), "a", "IN_PROGRESS", 1);
    expect(diffPositions(tasks, next)).toEqual([
      { id: "b", status: "TODO", position: 0 },
      { id: "c", status: "TODO", position: 1 },
      { id: "a", status: "IN_PROGRESS", position: 1 },
    ]);
  });

  it("変化がなければ空", () => {
    expect(diffPositions(tasks, groupIntoColumns(tasks))).toEqual([]);
  });

  it("欠番があれば詰め直す", () => {
    const gapped: PositionedTask[] = [
      { id: "a", status: "TODO", position: 0 },
      { id: "c", status: "TODO", position: 2 },
    ];
    expect(diffPositions(gapped, groupIntoColumns(gapped))).toEqual([{ id: "c", status: "TODO", position: 1 }]);
  });
});
