import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import type { ProjectInput } from "@/features/projects/schemas";
import type { TaskInput } from "@/features/tasks/schemas";

let sequence = 0;

export const TEST_PASSWORD = "password1234";

/** Better Auth 経由でユーザーを登録する（パスワードは実際にハッシュ化される） */
export async function createUser(name = `User ${++sequence}`) {
  const email = `user${Date.now()}-${++sequence}@example.com`;
  const result = await auth.api.signUpEmail({
    body: { name, email, password: TEST_PASSWORD },
  });
  return { id: result.user.id, name, email, isDemo: false };
}

export function projectInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: "テストプロジェクト",
    description: null,
    status: "PLANNING",
    startDate: null,
    dueDate: null,
    ...overrides,
  };
}

export function taskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: "テストタスク",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: null,
    startDate: null,
    dueDate: null,
    ...overrides,
  };
}

/** 既存プロジェクトにメンバーを直接追加する（メンバー管理機能は Phase 3） */
export async function addMember(projectId: string, userId: string) {
  return db.projectMember.create({ data: { projectId, userId, role: "MEMBER" } });
}
