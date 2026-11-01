import "server-only";
import { randomUUID } from "node:crypto";
import { parseDateOnly, toDateOnlyString } from "@/domain/dates";
import { DEMO_EMAIL_DOMAIN, DEMO_MAX_USERS, demoExpiryThreshold } from "@/domain/demo";
import { db } from "@/lib/db";
import { getDeploymentEnv } from "@/lib/env";
import { CRON_SECRET_MIN_LENGTH } from "@/lib/cron";

type Env = Record<string, string | undefined>;

/** "YYYY-MM-DD" に日数を足した日付（DB に保存する Date） */
function dayOffset(today: string, days: number): Date {
  return parseDateOnly(toDateOnlyString(new Date(parseDateOnly(today).getTime() + days * 86_400_000)));
}

function demoEmail() {
  return `temp-${randomUUID()}@${DEMO_EMAIL_DOMAIN}`;
}

/**
 * デモを開始できるか。
 * Vercel 上では、期限切れのデモのユーザーを削除する定期処理（CRON_SECRET が必要）が動く設定でなければ開始させない
 * （削除されないデモのユーザーが溜まり続けるのを防ぐ）。上限の数に達している場合も開始させない。
 */
export async function checkDemoAvailability(env: Env = process.env): Promise<"ok" | "not-configured" | "full"> {
  if (getDeploymentEnv(env) !== "local" && (env.CRON_SECRET?.length ?? 0) < CRON_SECRET_MIN_LENGTH) {
    return "not-configured";
  }
  // 同時に開始された場合は上限をわずかに超えうる（容量を守るための目安のため許容する）
  const count = await db.user.count({ where: { isAnonymous: true, demoOwnerId: null } });
  return count >= DEMO_MAX_USERS ? "full" : "ok";
}

/**
 * デモを開始したユーザーのサンプルデータを作る（1 トランザクション）。
 * 架空のメンバー 3 人（うち 1 人はメンバー追加を試す用で、どのプロジェクトにも所属しない）、プロジェクト 2 件、
 * タスク・コメント・更新履歴を作成する。日付は「今日」を基準にし、期限切れ・期限間近のタスクも含める。
 */
export async function createDemoWorkspace(userId: string, today: string) {
  const d = (days: number) => dayOffset(today, days);

  await db.$transaction(async (tx) => {
    const companion = (name: string) =>
      tx.user.create({
        data: { id: randomUUID(), name, email: demoEmail(), isAnonymous: true, demoOwnerId: userId },
        select: { id: true, name: true, email: true },
      });
    const sato = await companion("佐藤 花子");
    const suzuki = await companion("鈴木 一郎");
    const takahashi = await companion("高橋 健");

    // プロジェクト 1: 進行中。カンバンの 3 列すべてにタスクがある
    const web = await tx.project.create({
      data: {
        name: "コーポレートサイト リニューアル",
        description: "既存サイトのデザイン刷新と CMS 移行を行う（デモ用のサンプルデータです）。",
        status: "IN_PROGRESS",
        startDate: d(-14),
        dueDate: d(30),
      },
    });
    await tx.projectMember.createMany({
      data: [
        { projectId: web.id, userId, role: "OWNER" },
        { projectId: web.id, userId: sato.id, role: "MEMBER" },
        { projectId: web.id, userId: suzuki.id, role: "MEMBER" },
      ],
    });
    const webTasks = [
      { title: "トップページのデザイン", status: "IN_PROGRESS", priority: "URGENT", position: 0, assigneeId: userId, dueDate: d(-2) },
      { title: "サイトマップの見直し", status: "IN_PROGRESS", priority: "HIGH", position: 1, assigneeId: sato.id, dueDate: d(1) },
      { title: "CMS の選定", status: "TODO", priority: "MEDIUM", position: 0, assigneeId: suzuki.id, dueDate: d(5) },
      {
        title: "メンバーを追加してみる",
        description: `「メンバー」タブで次のメールアドレスを入力すると、架空のメンバー「${takahashi.name}」を追加できます。\n${takahashi.email}`,
        status: "TODO",
        priority: "LOW",
        position: 1,
      },
      { title: "お問い合わせフォームの改修", status: "TODO", priority: "LOW", position: 2, dueDate: d(14) },
      { title: "要件ヒアリング", status: "DONE", priority: "HIGH", position: 0, assigneeId: userId },
      { title: "競合サイトの調査", status: "DONE", priority: "MEDIUM", position: 1, assigneeId: sato.id },
    ] as const;
    const created = await tx.task.createManyAndReturn({
      data: webTasks.map((task) => ({ ...task, projectId: web.id })),
      select: { id: true, title: true },
    });
    const design = created.find((task) => task.title === "トップページのデザイン")!;

    await tx.activityLog.createMany({
      data: [
        ...created.map((task) => ({ projectId: web.id, taskId: task.id, userId, action: "TASK_CREATED" as const })),
        { projectId: web.id, taskId: design.id, userId, action: "STATUS_CHANGED", oldValue: "TODO", newValue: "IN_PROGRESS" },
        { projectId: web.id, taskId: design.id, userId: sato.id, action: "PRIORITY_CHANGED", oldValue: "HIGH", newValue: "URGENT" },
      ],
    });
    const now = new Date();
    await tx.comment.create({
      data: {
        taskId: design.id,
        userId: sato.id,
        content: "ワイヤーフレームを確認しました。ヘッダーの構成について相談させてください。",
        createdAt: now,
        updatedAt: now,
      },
    });

    // プロジェクト 2: 計画中
    const study = await tx.project.create({
      data: { name: "社内勉強会の運営", status: "PLANNING", dueDate: d(60) },
    });
    await tx.projectMember.createMany({
      data: [
        { projectId: study.id, userId, role: "OWNER" },
        { projectId: study.id, userId: suzuki.id, role: "MEMBER" },
      ],
    });
    const studyTasks = await tx.task.createManyAndReturn({
      data: [
        { projectId: study.id, title: "テーマの募集", status: "TODO", priority: "MEDIUM", position: 0, assigneeId: suzuki.id },
        { projectId: study.id, title: "会場の予約", status: "TODO", priority: "HIGH", position: 1, dueDate: d(10) },
      ],
      select: { id: true },
    });
    await tx.activityLog.createMany({
      data: studyTasks.map((task) => ({ projectId: study.id, taskId: task.id, userId, action: "TASK_CREATED" as const })),
    });
  });
}

/**
 * 期限切れのデモのユーザーを削除する（定期処理から呼ぶ）。
 * そのユーザーが Owner のプロジェクト（タスク・コメント・履歴は CASCADE）を先に削除し、
 * 次にユーザーを削除する（架空のメンバー・セッションは CASCADE）。
 * 1 回に削除する数は limit までとし、トランザクションを短く保つ。
 */
export async function cleanupExpiredDemoUsers(now: Date = new Date(), limit = 100) {
  return db.$transaction(async (tx) => {
    const expired = await tx.user.findMany({
      where: { isAnonymous: true, demoOwnerId: null, createdAt: { lt: demoExpiryThreshold(now) } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    if (expired.length === 0) return { deletedUsers: 0, deletedProjects: 0 };
    const ids = expired.map((user) => user.id);

    const projects = await tx.project.deleteMany({
      where: {
        members: {
          some: { role: "OWNER", user: { OR: [{ id: { in: ids } }, { demoOwnerId: { in: ids } }] } },
        },
      },
    });
    const users = await tx.user.deleteMany({ where: { id: { in: ids } } });
    return { deletedUsers: users.count, deletedProjects: projects.count };
  });
}
