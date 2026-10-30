import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/features/projects/actions";
import { createCommentAction, deleteCommentAction, updateCommentAction } from "@/features/comments/actions";
import { addMemberAction, removeMemberAction } from "@/features/members/actions";
import { createProject } from "@/features/projects/service";
import {
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  updateTaskAction,
} from "@/features/tasks/actions";
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
    expect(await moveTaskAction(task.id, { status: "DONE", index: 0 })).toEqual(unauthorized);

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

describe("moveTaskAction", () => {
  it("移動先の検証（不正なステータス・負の位置・小数）", async () => {
    const owner = await createUser();
    currentUser = owner;
    const project = await createProject(owner.id, projectInput());
    const task = await createTask(owner.id, project.id, taskInput());

    for (const input of [
      { status: "ARCHIVED", index: 0 },
      { status: "DONE", index: -1 },
      { status: "DONE", index: 1.5 },
      { status: "DONE" },
      null,
    ]) {
      expect((await moveTaskAction(task.id, input)).ok).toBe(false);
    }
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "TODO" });

    expect(await moveTaskAction(task.id, { status: "DONE", index: 0 })).toEqual({ ok: true, data: undefined });
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "DONE", position: 0 });
  });

  it("メンバー外のユーザーは移動できない（NotFound）", async () => {
    const owner = await createUser();
    const project = await createProject(owner.id, projectInput());
    const task = await createTask(owner.id, project.id, taskInput());
    currentUser = await createUser();
    expect(await moveTaskAction(task.id, { status: "DONE", index: 0 })).toEqual({ ok: false, error: m.errors.notFound });
  });
});

describe("メンバー・コメントの Action", () => {
  async function setupTeam() {
    const owner = await createUser("owner");
    const member = await createUser("member");
    const project = await createProject(owner.id, projectInput());
    await addMember(project.id, member.id);
    const task = await createTask(owner.id, project.id, taskInput());
    return { owner, member, project, task };
  }

  it("未ログインでは拒否される", async () => {
    const { project, member, task } = await setupTeam();
    const unauthorized = { ok: false, error: m.errors.unauthorized };
    expect(await addMemberAction(project.id, { email: "x@example.com" })).toEqual(unauthorized);
    expect(await removeMemberAction(project.id, member.id)).toEqual(unauthorized);
    expect(await createCommentAction(task.id, { content: "x" })).toEqual(unauthorized);
    expect(await db.comment.count()).toBe(0);
  });

  it("Member によるメンバー追加・削除は Forbidden", async () => {
    const { member, owner, project } = await setupTeam();
    currentUser = member;
    expect(await addMemberAction(project.id, { email: owner.email })).toEqual({ ok: false, error: m.errors.forbidden });
    expect(await removeMemberAction(project.id, owner.id)).toEqual({ ok: false, error: m.errors.forbidden });
  });

  it("メールアドレス・コメントの入力検証", async () => {
    const { owner, project, task } = await setupTeam();
    currentUser = owner;
    expect(await addMemberAction(project.id, { email: "not-an-email" })).toMatchObject({
      ok: false,
      fieldErrors: { email: [m.validation.invalidEmail] },
    });
    expect(await createCommentAction(task.id, { content: "   " })).toMatchObject({
      ok: false,
      fieldErrors: { content: [m.validation.required] },
    });
    expect((await createCommentAction(task.id, { content: "x".repeat(2001) })).ok).toBe(false);
    expect(await createCommentAction(task.id, { content: "  前後の空白は除去  " })).toEqual({ ok: true, data: undefined });
    expect(await db.comment.findFirst()).toMatchObject({ content: "前後の空白は除去" });
  });

  it("他人のコメントの編集・削除は Forbidden", async () => {
    const { owner, member, task } = await setupTeam();
    currentUser = member;
    await createCommentAction(task.id, { content: "member のコメント" });
    const comment = await db.comment.findFirstOrThrow();

    currentUser = owner;
    expect(await updateCommentAction(comment.id, { content: "x" })).toEqual({ ok: false, error: m.errors.forbidden });
    expect(await deleteCommentAction(comment.id)).toEqual({ ok: false, error: m.errors.forbidden });
    expect(await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({
      content: "member のコメント",
    });
  });
});
