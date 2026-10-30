/**
 * 開発用のサンプルデータ（npm run db:seed）。
 * 何度実行しても同じ状態になるよう、シード用ユーザーのデータを作り直す。
 *
 * ログイン: demo@example.com / demo-password
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_USERS = [
  { email: "demo@example.com", name: "デモユーザー", password: "demo-password" },
  { email: "member@example.com", name: "メンバー太郎", password: "demo-password" },
];

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seeding is disabled in production.");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  try {
    // 既存のシードユーザーと、そのユーザーが Owner のプロジェクトを削除
    const existing = await db.user.findMany({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } });
    await db.project.deleteMany({
      where: { members: { some: { userId: { in: existing.map((u) => u.id) }, role: "OWNER" } } },
    });
    await db.user.deleteMany({ where: { id: { in: existing.map((u) => u.id) } } });

    const [demo, member] = await Promise.all(
      DEMO_USERS.map(async ({ email, name, password }) => {
        const id = randomUUID();
        return db.user.create({
          data: {
            id,
            email,
            name,
            emailVerified: true,
            accounts: {
              create: {
                id: randomUUID(),
                accountId: id,
                providerId: "credential",
                password: await hashPassword(password),
              },
            },
          },
        });
      }),
    );

    await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: "コーポレートサイト リニューアル",
          description: "既存サイトのデザイン刷新と CMS 移行を行う。",
          status: "IN_PROGRESS",
          startDate: date("2026-10-01"),
          dueDate: date("2026-12-25"),
        },
      });
      await tx.projectMember.createMany({
        data: [
          { projectId: project.id, userId: demo.id, role: "OWNER" },
          { projectId: project.id, userId: member.id, role: "MEMBER" },
        ],
      });
      await tx.task.createMany({
        data: [
          { projectId: project.id, title: "要件ヒアリング", status: "DONE", priority: "HIGH", position: 0, assigneeId: demo.id },
          { projectId: project.id, title: "サイトマップ作成", status: "DONE", priority: "MEDIUM", position: 1, assigneeId: member.id },
          { projectId: project.id, title: "トップページのデザイン", status: "IN_PROGRESS", priority: "URGENT", position: 0, assigneeId: demo.id, dueDate: date("2026-10-25") },
          { projectId: project.id, title: "CMS の選定", status: "TODO", priority: "MEDIUM", position: 0, dueDate: date("2026-11-15") },
          { projectId: project.id, title: "コンテンツ移行", status: "TODO", priority: "LOW", position: 1 },
        ],
      });

      // 更新履歴とコメントのサンプル（アプリ経由で作成した場合と同じ形）
      const tasks = await tx.task.findMany({ where: { projectId: project.id }, select: { id: true, title: true } });
      await tx.activityLog.createMany({
        data: tasks.map((task) => ({ projectId: project.id, taskId: task.id, userId: demo.id, action: "TASK_CREATED" as const })),
      });
      const design = tasks.find((task) => task.title === "トップページのデザイン")!;
      await tx.activityLog.createMany({
        data: [
          { projectId: project.id, taskId: design.id, userId: demo.id, action: "STATUS_CHANGED", oldValue: "TODO", newValue: "IN_PROGRESS" },
          { projectId: project.id, taskId: design.id, userId: demo.id, action: "PRIORITY_CHANGED", oldValue: "HIGH", newValue: "URGENT" },
        ],
      });
      const commentedAt = new Date();
      await tx.comment.create({
        data: {
          taskId: design.id,
          userId: member.id,
          content: "ワイヤーフレームを確認しました。ヘッダーの構成について相談させてください。",
          createdAt: commentedAt,
          updatedAt: commentedAt,
        },
      });

      const personal = await tx.project.create({
        data: { name: "個人ブログ開発", status: "PLANNING", dueDate: date("2027-03-31") },
      });
      await tx.projectMember.create({ data: { projectId: personal.id, userId: demo.id, role: "OWNER" } });
    });

    console.info("Seeded. Login: demo@example.com / demo-password");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
