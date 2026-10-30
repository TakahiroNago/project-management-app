/**
 * アプリケーション共通のエラー。
 * サービス層はこれらを投げ、Server Action（runAction）がユーザー向けの結果に変換する。
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "UNAUTHORIZED") {
    super(message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "FORBIDDEN") {
    super(message, "FORBIDDEN");
  }
}

/** 所属していないプロジェクトへのアクセスも NotFound として扱い、存在自体を隠す */
export class NotFoundError extends AppError {
  constructor(message = "NOT_FOUND") {
    super(message, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "VALIDATION",
    readonly fieldErrors: Record<string, string[] | undefined> = {},
  ) {
    super(message, "VALIDATION");
  }
}
