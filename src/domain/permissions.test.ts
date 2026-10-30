import { describe, expect, it } from "vitest";
import { can, PROJECT_PERMISSIONS, type ProjectPermission } from "./permissions";

describe("can", () => {
  const ownerOnly: ProjectPermission[] = ["project:update", "project:delete", "member:manage"];
  const everyone: ProjectPermission[] = [
    "project:view",
    "member:view",
    "task:view",
    "task:create",
    "task:update",
    "task:delete",
    "comment:view",
    "comment:create",
  ];

  it("権限表のすべての操作がテストで分類されている", () => {
    expect([...ownerOnly, ...everyone].sort()).toEqual(Object.keys(PROJECT_PERMISSIONS).sort());
  });

  it.each(everyone)("OWNER と MEMBER の両方が %s を実行できる", (permission) => {
    expect(can("OWNER", permission)).toBe(true);
    expect(can("MEMBER", permission)).toBe(true);
  });

  it.each(ownerOnly)("%s は OWNER のみ実行できる", (permission) => {
    expect(can("OWNER", permission)).toBe(true);
    expect(can("MEMBER", permission)).toBe(false);
  });

  it.each(Object.keys(PROJECT_PERMISSIONS) as ProjectPermission[])(
    "メンバーでない（role が null / undefined）場合は %s を実行できない",
    (permission) => {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    },
  );
});
