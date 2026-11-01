import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL_DOMAIN, DEMO_MAX_USERS, DEMO_TTL_MS } from "@/domain/demo";
import { checkDemoAvailability, cleanupExpiredDemoUsers } from "@/features/demo/service";
import { addMember } from "@/features/members/service";
import { createProject } from "@/features/projects/service";
import { m } from "@/i18n";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { flushBackgroundTasks } from "../helpers/background";
import { createUser, projectInput, TEST_PASSWORD } from "../helpers/factories";

vi.mock("@/lib/mail", () => ({
  sendPasswordResetEmail: vi.fn(async () => true),
}));

const { sendPasswordResetEmail } = await import("@/lib/mail");
const sendMailMock = vi.mocked(sendPasswordResetEmail);

/** 実際の HTTP ハンドラー経由でデモを開始し、ユーザーとセッションの Cookie を返す */
async function startDemo() {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: "{}",
    }),
  );
  if (res.status !== 200) return { res, user: null, cookie: null };
  const body = (await res.json()) as { user: { id: string } };
  const cookie = (res.headers.get("set-cookie") ?? "")
    .split(/,(?=\s*[\w.-]+=)/)
    .map((part) => part.split(";")[0].trim())
    .join("; ");
  const user = await db.user.findUniqueOrThrow({ where: { id: body.user.id } });
  return { res, user, cookie };
}

beforeEach(() => {
  sendMailMock.mockClear();
});

describe("デモの開始", () => {
  it("一時的なユーザーでログインし、サンプルデータ（架空のメンバー・プロジェクト・タスク）が作られる", async () => {
    const { res, user, cookie } = await startDemo();
    expect(res.status).toBe(200);
    expect(user).toMatchObject({ isAnonymous: true, demoOwnerId: null, name: "ゲスト" });
    expect(user!.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);

    // パスワードを持たない（パスワードでのログイン・変更はできない）
    expect(await db.account.count({ where: { userId: user!.id, providerId: "credential" } })).toBe(0);

    // セッションが有効で、デモのユーザーとして扱われる
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie! }) });
    expect(session?.user).toMatchObject({ id: user!.id, isAnonymous: true });

    const companions = await db.user.findMany({ where: { demoOwnerId: user!.id } });
    expect(companions).toHaveLength(3);
    expect(companions.every((c) => c.isAnonymous && c.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`))).toBe(true);

    const projects = await db.project.findMany({
      where: { members: { some: { userId: user!.id, role: "OWNER" } } },
      include: { tasks: true, members: true },
    });
    expect(projects).toHaveLength(2);
    const tasks = projects.flatMap((project) => project.tasks);
    expect(tasks.length).toBeGreaterThanOrEqual(9);
    // 各列の position は 0 始まりの連番
    for (const project of projects) {
      for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
        const positions = project.tasks.filter((t) => t.status === status).map((t) => t.position).sort();
        expect(positions).toEqual(positions.map((_, i) => i));
      }
    }
    // 担当者はそのプロジェクトのメンバー
    for (const project of projects) {
      const memberIds = new Set(project.members.map((member) => member.userId));
      for (const task of project.tasks) {
        if (task.assigneeId) expect(memberIds.has(task.assigneeId)).toBe(true);
      }
    }
    expect(await db.comment.count()).toBe(1);
  });

  it("デモのユーザーのままもう一度デモを開始することはできない", async () => {
    const { cookie } = await startDemo();
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/anonymous", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: cookie! },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(await db.user.count({ where: { isAnonymous: true, demoOwnerId: null } })).toBe(1);
  });

  it(`デモのユーザーが上限（${DEMO_MAX_USERS} 人）に達していれば開始できず、ユーザーも作られない`, async () => {
    await db.user.createMany({
      data: Array.from({ length: DEMO_MAX_USERS }, (_, i) => ({
        id: `demo-${i}`,
        name: "ゲスト",
        email: `temp-${i}@${DEMO_EMAIL_DOMAIN}`,
        isAnonymous: true,
      })),
    });
    const { res } = await startDemo();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "DEMO_UNAVAILABLE" });
    expect(await db.user.count()).toBe(DEMO_MAX_USERS);
  });

  it("架空のメンバーは上限の数に含めない", async () => {
    const { user } = await startDemo();
    expect(await db.user.count({ where: { demoOwnerId: user!.id } })).toBe(3);
    await expect(checkDemoAvailability({})).resolves.toBe("ok");
  });

  it("Vercel 上では CRON_SECRET（32 文字以上）が無ければ開始できない（削除の定期処理が動かないため）", async () => {
    for (const VERCEL_ENV of ["production", "preview"]) {
      await expect(checkDemoAvailability({ VERCEL_ENV })).resolves.toBe("not-configured");
      await expect(checkDemoAvailability({ VERCEL_ENV, CRON_SECRET: "x".repeat(31) })).resolves.toBe("not-configured");
      await expect(checkDemoAvailability({ VERCEL_ENV, CRON_SECRET: "x".repeat(32) })).resolves.toBe("ok");
    }
    await expect(checkDemoAvailability({})).resolves.toBe("ok");
  });
});

describe("デモのユーザーの制限", () => {
  it("パスワード再設定メールは送らない", async () => {
    const { user } = await startDemo();
    await auth.api.requestPasswordReset({ body: { email: user!.email, redirectTo: "/reset-password" } });
    await flushBackgroundTasks();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("パスワードは変更できない", async () => {
    const { cookie } = await startDemo();
    await expect(
      auth.api.changePassword({
        headers: new Headers({ cookie: cookie! }),
        body: { currentPassword: "anything", newPassword: TEST_PASSWORD },
      }),
    ).rejects.toThrow();
  });

  it("自分のデモの架空のメンバーは追加でき、実在のユーザー・他人のデモのユーザーは「見つからない」", async () => {
    const { user } = await startDemo();
    const { user: other } = await startDemo();
    const real = await createUser("real");
    const project = await db.project.findFirstOrThrow({
      where: { members: { some: { userId: user!.id, role: "OWNER" } }, name: "コーポレートサイト リニューアル" },
    });
    const notMember = await db.user.findFirstOrThrow({ where: { demoOwnerId: user!.id, name: "高橋 健" } });
    const othersCompanion = await db.user.findFirstOrThrow({ where: { demoOwnerId: other!.id } });

    await expect(addMember(user!.id, project.id, notMember.email)).resolves.toMatchObject({ name: "高橋 健" });

    for (const email of [real.email, other!.email, othersCompanion.email]) {
      await expect(addMember(user!.id, project.id, email)).rejects.toMatchObject({
        fieldErrors: { email: [m.member.userNotFound] },
      });
    }
  });

  it("通常のユーザーはデモのユーザーを追加できない（「見つからない」）", async () => {
    const { user } = await startDemo();
    const owner = await createUser("owner");
    const project = await createProject(owner.id, projectInput());
    const companion = await db.user.findFirstOrThrow({ where: { demoOwnerId: user!.id } });
    for (const email of [user!.email, companion.email]) {
      await expect(addMember(owner.id, project.id, email)).rejects.toMatchObject({
        fieldErrors: { email: [m.member.userNotFound] },
      });
    }
  });
});

describe("期限切れのデモの削除", () => {
  it("期限切れのデモのユーザーと、そのプロジェクト・架空のメンバー・セッションを削除し、他は残す", async () => {
    const now = new Date();
    const { user: expired } = await startDemo();
    const { user: fresh } = await startDemo();
    await db.user.update({ where: { id: expired!.id }, data: { createdAt: new Date(now.getTime() - DEMO_TTL_MS - 1000) } });
    const real = await createUser("real");
    const realProject = await createProject(real.id, projectInput({ name: "通常のプロジェクト" }));

    await expect(cleanupExpiredDemoUsers(now)).resolves.toEqual({ deletedUsers: 1, deletedProjects: 2 });

    expect(await db.user.count({ where: { OR: [{ id: expired!.id }, { demoOwnerId: expired!.id }] } })).toBe(0);
    expect(await db.session.count({ where: { userId: expired!.id } })).toBe(0);
    expect(await db.project.count({ where: { members: { some: { userId: expired!.id } } } })).toBe(0);

    // 期限内のデモ・通常のユーザーとプロジェクトは残る
    expect(await db.user.count({ where: { demoOwnerId: fresh!.id } })).toBe(3);
    expect(await db.project.count({ where: { members: { some: { userId: fresh!.id } } } })).toBe(2);
    expect(await db.project.findUnique({ where: { id: realProject.id } })).not.toBeNull();
    expect(await db.user.findUnique({ where: { id: real.id } })).not.toBeNull();

    // 期限切れのものが無ければ何もしない
    await expect(cleanupExpiredDemoUsers(now)).resolves.toEqual({ deletedUsers: 0, deletedProjects: 0 });
  });

  it("期限ちょうどのユーザーは削除しない", async () => {
    const now = new Date();
    const { user } = await startDemo();
    await db.user.update({ where: { id: user!.id }, data: { createdAt: new Date(now.getTime() - DEMO_TTL_MS) } });
    await expect(cleanupExpiredDemoUsers(now)).resolves.toMatchObject({ deletedUsers: 0 });
  });

  it("1 回に削除する数は limit まで（古い順）", async () => {
    const now = new Date();
    const users = [];
    for (let i = 0; i < 3; i++) users.push((await startDemo()).user!);
    for (const [i, user] of users.entries()) {
      await db.user.update({ where: { id: user.id }, data: { createdAt: new Date(now.getTime() - DEMO_TTL_MS - (10 - i) * 1000) } });
    }
    await expect(cleanupExpiredDemoUsers(now, 2)).resolves.toMatchObject({ deletedUsers: 2 });
    expect(await db.user.findUnique({ where: { id: users[2].id } })).not.toBeNull();
  });
});

describe("定期処理の API（/api/cron/demo-cleanup）", () => {
  const SECRET = "c".repeat(32);
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const call = async (authorization?: string) => {
    const { GET } = await import("@/app/api/cron/demo-cleanup/route");
    return GET(new Request("http://localhost:3000/api/cron/demo-cleanup", { headers: authorization ? { authorization } : {} }));
  };

  it("CRON_SECRET が一致すれば期限切れのデモを削除する", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { user } = await startDemo();
    await db.user.update({ where: { id: user!.id }, data: { createdAt: new Date(Date.now() - DEMO_TTL_MS - 60_000) } });

    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedUsers: 1, deletedProjects: 2 });
    expect(await db.user.count()).toBe(0);
  });

  it("認証ヘッダーが無い・違う・CRON_SECRET が未設定なら 401 で、何も削除しない", async () => {
    const { user } = await startDemo();
    await db.user.update({ where: { id: user!.id }, data: { createdAt: new Date(Date.now() - DEMO_TTL_MS - 60_000) } });

    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"d".repeat(32)}`)).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);

    expect(await db.user.count({ where: { id: user!.id } })).toBe(1);
  });
});
