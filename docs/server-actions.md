# Server Actions 一覧（API 設計資料）

> ProjectFlow は REST API を公開しない。**更新は Server Actions**、**読み取りは Server Components からの直接クエリ**、**認証は Better Auth の API**（`/api/auth/*`）で行う（[design.md](./design.md) 3.3）。全体の流れは [architecture.md](./architecture.md) の 4 章。

## 1. 共通の仕様

### 1.1 処理の順序

すべての Action は次の順で処理する（`src/features/*/actions.ts`）。

1. **認証**: `requireActionUser()`。セッションを DB で検証する
2. **入力検証**: `parseInput(schema, input)`。ID・入力値はすべて `unknown` として受け取り、Zod で検証する（クライアントのフォームと同じスキーマ）
3. **認可**: サービス層（`service.ts`）の `authorizeProject()`。対象の所属プロジェクトは**サーバー側で DB から解決**し、クライアントから送られた値は信用しない
4. **DB 操作**: 認可と更新を**同一トランザクション**で行う。更新履歴も同じトランザクションで記録する
5. **再検証**: `revalidatePath()` で関係する画面を再描画する

CSRF 対策として、Next.js が Server Action の Origin を検証する。

### 1.2 戻り値（`ActionResult`）

```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
```

`runAction()`（`src/lib/action-result.ts`）が例外を次のように変換する。`error` は利用者向けの日本語のメッセージ。

| 例外 | 条件 | `error` | `fieldErrors` |
|---|---|---|---|
| `UnauthorizedError` | 未ログイン・セッション切れ | ログインが必要です。再度ログインしてください。 | — |
| `ValidationError` | 入力が不正、業務ルール違反 | 入力内容を確認してください（または個別のメッセージ） | 項目名 → メッセージ（項目以外は `_form`） |
| `NotFoundError` | 対象が存在しない、**または所属していないプロジェクト**（存在を隠す） | 対象が見つかりません。削除されたか、アクセス権がありません。 | — |
| `ForbiddenError` | メンバーだが権限がない | この操作を行う権限がありません | — |
| その他 | 予期しない例外 | 予期しないエラーが発生しました。時間をおいて再度お試しください。 | — |

予期しない例外の詳細はクライアントに返さず、サーバーのログ（`[action] Unexpected error:`）にのみ記録する。

### 1.3 権限

`src/domain/permissions.ts` の権限表による。プロジェクトのメンバーでない場合はすべて NotFound。

| 操作 | Owner | Member |
|---|:-:|:-:|
| プロジェクトの更新・削除 | ○ | × |
| メンバーの追加・削除 | ○ | × |
| タスクの作成・更新・移動・削除 | ○ | ○ |
| コメントの投稿 | ○ | ○ |
| コメントの編集・削除 | 投稿者本人のみ | 投稿者本人のみ |

### 1.4 共通の入力の型

| 型 | 規則 |
|---|---|
| ID | 文字列。前後の空白を除いて 1〜64 文字（`idSchema`） |
| 必須の文字列 | 前後の空白を除いて 1 文字以上、上限あり（`requiredText`） |
| 任意の文字列 | 上限あり。空文字・`null`・未指定は `null`（`optionalText`） |
| 日付 | `"YYYY-MM-DD"` の実在する日付。空文字・`null`・未指定は `null`。開始日・期限の両方があれば開始日 ≤ 期限 |

## 2. プロジェクト（`src/features/projects/actions.ts`）

### `createProjectAction(input)`

プロジェクトを作成し、作成者を Owner として登録する（同一トランザクション）。

- **権限**: ログインしていれば誰でも
- **入力**（`projectInputSchema`）

  | 項目 | 型 | 規則 |
  |---|---|---|
  | `name` | string | 必須、100 文字以内 |
  | `description` | string \| null | 任意、2000 文字以内 |
  | `status` | `PLANNING` \| `IN_PROGRESS` \| `COMPLETED` \| `ON_HOLD` | 必須 |
  | `startDate` / `dueDate` | `"YYYY-MM-DD"` \| null | 任意、開始日 ≤ 期限 |

- **戻り値**: `{ id: string }`（作成したプロジェクトの ID）
- **再検証**: `/projects`、`/dashboard`

### `updateProjectAction(projectId, input)`

- **権限**: Owner
- **入力**: `createProjectAction` と同じ
- **戻り値**: なし
- **エラー**: 所属外・存在しない → NotFound、Member → Forbidden
- **再検証**: `/projects/[id]`（レイアウト以下）、`/projects`、`/dashboard`

### `deleteProjectAction(projectId)`

プロジェクトを削除する。メンバー・タスク・コメント・更新履歴は外部キーの CASCADE で削除される。

- **権限**: Owner
- **戻り値**: なし
- **エラー**: 所属外・存在しない → NotFound、Member → Forbidden
- **再検証**: `/projects`、`/dashboard`

## 3. タスク（`src/features/tasks/actions.ts`）

タスクの更新・移動・削除は**プロジェクト行をロック**して直列に処理し、並び順（`position`）の重複・欠番を防ぐ。再検証はいずれも `/projects/[id]`（レイアウト以下）、`/projects`、`/dashboard`。

### `createTaskAction(projectId, input)`

指定した列（ステータス）の末尾に追加し、履歴（`TASK_CREATED`）を記録する。

- **権限**: Owner・Member
- **入力**（`taskInputSchema`）

  | 項目 | 型 | 規則 |
  |---|---|---|
  | `title` | string | 必須、200 文字以内 |
  | `description` | string \| null | 任意、5000 文字以内 |
  | `status` | `TODO` \| `IN_PROGRESS` \| `DONE` | 必須 |
  | `priority` | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` | 必須 |
  | `assigneeId` | string \| null | 任意。**そのプロジェクトのメンバー**であること |
  | `startDate` / `dueDate` | `"YYYY-MM-DD"` \| null | 任意、開始日 ≤ 期限 |

- **戻り値**: なし
- **エラー**: 所属外・存在しない → NotFound、担当者がメンバーでない → Validation（`assigneeId`）

### `updateTaskAction(taskId, input)`

- **権限**: Owner・Member
- **入力**: `createTaskAction` と同じ
- **処理**: ステータスが変わった場合は移動先の列の末尾に置き、移動元の列を詰める。ステータス・担当者・期限・優先度の変更を履歴に記録する
- **戻り値**: なし
- **エラー**: `createTaskAction` と同じ

### `moveTaskAction(taskId, input)`

カンバンのドラッグ＆ドロップによる移動（列内の並べ替え・列間の移動）。

- **権限**: Owner・Member
- **入力**（`moveTaskInputSchema`）

  | 項目 | 型 | 規則 |
  |---|---|---|
  | `status` | `TODO` \| `IN_PROGRESS` \| `DONE` | 移動先の列 |
  | `index` | number | 移動先の列内の位置（0 始まり）。0〜100000 の整数。列の長さを超える値は末尾 |

- **処理**: 移動元・移動先の列の `position` を 0 始まりの連番に振り直す（タスクの数によらず 1 回の UPDATE）。列が変わった場合は `STATUS_CHANGED` を履歴に記録する
- **戻り値**: なし。失敗時、画面はドラッグ前の並びに戻す

### `deleteTaskAction(taskId)`

タスクを削除し、その列を詰め直す。コメント・履歴は CASCADE で削除される。

- **権限**: Owner・Member
- **戻り値**: なし

## 4. メンバー（`src/features/members/actions.ts`）

### `addMemberAction(projectId, input)`

登録済みのユーザーをメールアドレスで Member として追加する（招待メールは送らない）。

- **権限**: Owner
- **入力**: `{ email: string }`（前後の空白を除き小文字にしてから、メールアドレスの形式を検証）
- **戻り値**: `{ name: string }`（追加したユーザーの名前）
- **エラー**: ユーザーが存在しない・既にメンバー（同時に追加した場合を含む）→ Validation（`email`）、Member → Forbidden
- **デモ**: デモのユーザーは自分のデモの架空のメンバーだけを、通常のユーザーは通常のユーザーだけを追加できる。それ以外は「存在しない」と同じエラー
- **再検証**: `/projects/[id]`（レイアウト以下）

### `removeMemberAction(projectId, memberUserId)`

- **権限**: Owner。**Owner 自身は削除できない**
- **処理**: 同一トランザクションで、そのメンバーが担当するタスクを未割り当てに戻し、`ASSIGNEE_CHANGED` を履歴に記録する（プロジェクト行をロックし、並行する担当者の設定と直列に処理）
- **戻り値**: `{ name: string }`（削除したメンバーの名前）
- **エラー**: 対象がメンバーでない → NotFound、対象が Owner → Validation、Member → Forbidden
- **再検証**: `/projects/[id]`（レイアウト以下）、`/dashboard`

## 5. コメント（`src/features/comments/actions.ts`）

再検証はいずれも `/projects/[id]`（レイアウト以下）。

### `createCommentAction(taskId, input)`

- **権限**: Owner・Member
- **入力**: `{ content: string }`（必須、2000 文字以内）
- **戻り値**: なし

### `updateCommentAction(commentId, input)` / `deleteCommentAction(commentId)`

- **権限**: **投稿者本人のみ**（Owner でも他人のコメントは変更できない）
- **入力**: 更新は `createCommentAction` と同じ
- **戻り値**: なし
- **エラー**: 所属外・存在しない → NotFound、本人以外 → Forbidden

## 6. 認証（Better Auth の API）

ブラウザから `authClient`（`src/lib/auth/auth-client.ts`）経由で呼ぶ。Origin 検証は常に有効。レート制限は IP アドレス単位で DB に保存する（Vercel 上では常に有効）。

| 画面 | エンドポイント | レート制限 | 備考 |
|---|---|---|---|
| ユーザー登録 | `POST /api/auth/sign-up/email` | 60 秒に 5 回 | 名前を検証（1〜50 文字）。`image` は拒否。登録後は自動でログイン |
| ログイン | `POST /api/auth/sign-in/email` | 60 秒に 10 回 | セッションの有効期限は 7 日（1 日ごとに延長） |
| ログアウト | `POST /api/auth/sign-out` | 既定 | |
| パスワード再設定の申請 | `POST /api/auth/request-password-reset` | 5 分に 3 回 | ユーザーの有無によらず同じ応答。メールは応答後に送信 |
| パスワードの再設定 | `POST /api/auth/reset-password` | 5 分に 10 回 | トークンは 30 分有効・使い捨て。既存のセッションはすべて無効化 |
| パスワード変更 | `POST /api/auth/change-password` | 60 秒に 5 回 | 現在のパスワードが必要 |
| プロフィール更新 | `POST /api/auth/update-user` | 既定 | `name` 以外の項目は拒否（400 `INVALID_USER_INPUT`） |
| デモの開始 | `POST /api/auth/sign-in/anonymous` | 1 時間に 3 回 | 一時的なユーザーとサンプルデータを作成してログイン。上限（200 人）・`CRON_SECRET` 未設定の環境では 503 `DEMO_UNAVAILABLE`。デモのユーザーのままでは 400 |

デモのユーザーはパスワードを持たないため、パスワードでのログイン・変更・再設定はできない（再設定メールも送らない）。期限切れのデモは定期処理 `GET /api/cron/demo-cleanup`（`Authorization: Bearer <CRON_SECRET>` が必要。Vercel Cron が 1 日 1 回呼ぶ）で削除する。

パスワードは 8〜128 文字。入力検証フックは `src/lib/auth/user-input.ts`、設定は `src/lib/auth/auth.ts`。

## 7. 読み取り（参考）

読み取りは Server Actions ではなく、ページ（Server Component）から `src/features/*/queries.ts` を直接呼ぶ。Server Actions は逐次実行のためデータ取得には使わない（Next.js の推奨）。

| 画面 | パス | 主なクエリ |
|---|---|---|
| ダッシュボード | `/dashboard` | `dashboard/queries.ts` |
| プロジェクト一覧 | `/projects?q=&status=&sort=&page=` | `projects/queries.ts`（不正な値は既定値に戻す） |
| プロジェクトの概要・カンバン・メンバー・設定 | `/projects/[id]`、`/board`、`/members`、`/settings` | `projects/queries.ts`、`tasks/queries.ts`、`members/queries.ts` |
| タスクの詳細 | `/projects/[id]?task=<id>`、`/projects/[id]/board?task=<id>` | `tasks/thread.ts`（別のプロジェクトのタスクは表示しない） |

所属していないプロジェクトは 404 を返す（存在を隠す）。
