import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/features/projects/actions";
import { createProject } from "@/features/projects/service";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/features/tasks/actions";
import { createTask } from "@/features/tasks/service";
import { m } from "@/i18n";
import { type CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/lib/errors";
import { addMember, createUser, projectInput, taskInput } from "../helpers/factories";

// Server Action の認証はリクエストの Cookie に依存するため、ログイン中ユーザーを差し替えて検証する
let currentUser: CurrentUser | null = null;
vi.mock("@/lib/auth/session", () => ({
  requireActionUser: vi.fn(async () => {
    if (!currentUser) throw new UnauthorizedError();
    return currentUser;
  }),
}));

beforeEach(() => {
  currentUser = null;
});

describe("未ログイン", () => {
  it("すべての更新系 Action が拒否され、DB は変更されない", async () => {
    const owner = await createUser();
    const project = await createProject(owner.id, projectInput({ name: "元" }));
    const task = await createTask(owner.id, project.id, taskInput());
    const unauthorized = { ok: false, error: m.errors.unauthorized };

    expect(await createProjectAction(projectInput())).toEqual(unauthorized);
    expect(await updateProjectAction(project.id, projectInput({ name: "x" }))).toEqual(unauthorized);
    expect(await deleteProjectAction(project.id)).toEqual(unauthorized);
    expect(await createTaskAction(project.id, taskInput())).toEqual(unauthorized);
    expect(await updateTaskAction(task.id, taskInput({ title: "x" }))).toEqual(unauthorized);
    expect(await deleteTaskAction(task.id)).toEqual(unauthorized);

    expect(await db.project.findMany()).toEqual([expect.objectContaining({ name: "元" })]);
    expect(await db.task.count()).toBe(1);
  });
});

describe("入力検証", () => {
  it("不正な入力は項目ごとのエラーを返す", async () => {
    currentUser = await createUser();
    const result = await createProjectAction({
      name: "   ",
      status: "UNKNOWN",
      startDate: "2026-12-01",
      dueDate: "2026-11-01",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toMatchObject({
      name: [m.validation.required],
      status: [m.validation.invalidOption],
    });
    expect(await db.project.count()).toBe(0);
  });

  it("開始日より前の期限は拒否される", async () => {
    currentUser = await createUser();
    const result = await createProjectAction(
      projectInput({ startDate: "2026-12-01", dueDate: "2026-11-01" }),
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { dueDate: [m.validation.dateOrder] } });
  });

  it("想定外の型（オブジェクト以外・巨大な文字列）も安全に拒否する", async () => {
    currentUser = await createUser();
    expect((await createProjectAction(null)).ok).toBe(false);
    expect((await createProjectAction("string")).ok).toBe(false);
    expect((await createProjectAction(projectInput({ name: "x".repeat(101) }))).ok).toBe(false);
    expect((await deleteProjectAction({ id: "x" })).ok).toBe(false);
  });

  it("スクリプトを含む文字列もそのまま文字列として保存される（出力時に React がエスケープする）", async () => {
    currentUser = await createUser();
    const name = '<script>alert("xss")</script>';
    const result = await createProjectAction(projectInput({ name }));
    expect(result.ok).toBe(true);
    expect(await db.project.findFirst()).toMatchObject({ name });
  });

  it("余分なフィールド（他ユーザーの ID 等）は無視される", async () => {
    const owner = await createUser();
    currentUser = owner;
    const victim = await createUser();
    const result = await createProjectAction({ ...projectInput(), ownerId: victim.id, id: "fixed-id" });
    expect(result.ok).toBe(true);
    const project = await db.project.findFirstOrThrow({ include: { members: true } });
    expect(project.id).not.toBe("fixed-id");
    expect(project.members).toEqual([expect.objectContaining({ userId: owner.id, role: "OWNER" })]);
  });
});

describe("認可エラーのメッセージ", () => {
  it("メンバー外には NotFound、権限不足の Member には Forbidden を返す", async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const project = await createProject(owner.id, projectInput());
    await addMember(project.id, member.id);

    currentUser = outsider;
    expect(await deleteProjectAction(project.id)).toEqual({ ok: false, error: m.errors.notFound });
    expect(await createTaskAction(project.id, taskInput())).toEqual({ ok: false, error: m.errors.notFound });

    currentUser = member;
    expect(await deleteProjectAction(project.id)).toEqual({ ok: false, error: m.errors.forbidden });
    expect(await createTaskAction(project.id, taskInput())).toEqual({ ok: true, data: undefined });

    expect(await db.project.count()).toBe(1);
  });

  it("成功時は作成したプロジェクトの ID を返す", async () => {
    currentUser = await createUser();
    const result = await createProjectAction(projectInput({ name: "OK" }));
    expect(result).toEqual({ ok: true, data: { id: expect.any(String) } });
  });
});
