# 進捗・フェーズ報告

## Phase 1: 基本機能（2026-10-30 完了）

### 実装内容

| 領域 | 内容 |
|---|---|
| 環境 | Next.js 16.4.3（App Router / Turbopack）、TypeScript、Tailwind CSS v4、shadcn/ui（radix-nova）。依存はすべてバージョン固定（`.npmrc` の `save-exact`） |
| DB | Docker Compose で PostgreSQL 17（開発用 `projectflow` / テスト用 `projectflow_test`、ホストのポート 5433）。Prisma 7.10.1 + `@prisma/adapter-pg`。**全テーブル**（Phase 3 で使うコメント・履歴を含む）のスキーマとマイグレーション |
| DB 整合性 | 「OWNER がちょうど 1 人」を保証する DEFERRABLE 制約トリガー |
| 認証 | Better Auth 1.7.14：登録、ログイン、ログアウト、パスワード再設定（30 分・使い捨て・全セッション無効化）、パスワード変更（他端末のセッション無効化）、表示名変更、DB 保存のレート制限、Origin 検証 |
| メール | 本番は Resend、開発はコンソール出力。`after()` でレスポンス後に送信。本番は URL・トークンをログに出さない |
| 認可 | 権限表（`src/domain/permissions.ts`）と `authorizeProject()`。所属外は NotFound、権限不足は Forbidden。更新系は認可と更新を同一トランザクションで実行 |
| 画面 | ログイン / 登録 / パスワード再設定（2 画面）/ ダッシュボード（仮）/ プロジェクト一覧・作成・詳細・設定 / ユーザー設定 / 404・エラー画面 |
| プロジェクト | 作成（作成者を OWNER として同一トランザクションで登録）、編集・削除（Owner のみ、削除は確認ダイアログ）、名前検索・ステータス絞り込み・並べ替え（更新日・作成日・期限・名前）・ページネーション（20 件）、進捗率表示 |
| タスク | プロジェクト詳細での一覧・作成・編集・削除（確認ダイアログ）。優先度・担当者（メンバーのみ）・開始日・期限、期限切れ表示 |
| UI 基盤 | サイドバー（PC は折りたたみ可、スマートフォンはドロワー）、ダークモード（ライト / ダーク / システム）、文言・日付書式の一元管理（`src/i18n`） |
| テスト・CI | Vitest（unit / integration の 2 プロジェクト）、Playwright（desktop / mobile）、GitHub Actions（3 ジョブ） |
| 開発用データ | `npm run db:seed`（demo@example.com / demo-password） |

### 主な変更ファイル

```
設定      package.json, package-lock.json, .npmrc, .nvmrc, .env.example, .gitignore, next.config.ts,
          tsconfig.json, eslint.config.mjs, components.json, docker-compose.yml,
          docker/postgres/init/01-create-test-db.sql, prisma.config.ts, vitest.config.mts,
          playwright.config.ts, .github/workflows/ci.yml
DB        prisma/schema.prisma, prisma/migrations/*（init, project_owner_invariant）, prisma/seed.ts
ドメイン  src/domain/{permissions,progress,dates}.ts（+ *.test.ts）
基盤      src/lib/{db,errors,action-result,validation,form,mail,background,utils}.ts,
          src/lib/auth/{auth,auth-client,session,authorization}.ts, src/proxy.ts,
          src/i18n/{index,format}.ts, src/i18n/messages/ja.ts
機能      src/features/auth/**, src/features/projects/**, src/features/tasks/**, src/features/settings/**
画面      src/app/layout.tsx, page.tsx, not-found.tsx, globals.css, api/auth/[...all]/route.ts,
          src/app/(auth)/**, src/app/(app)/**
UI        src/components/{form,layout}/*, status-badges.tsx, simple-pagination.tsx, theme-provider.tsx,
          src/components/ui/*（shadcn 生成物）, src/hooks/use-mobile.ts（lint エラー解消のため書き換え）
テスト    tests/helpers/*, tests/integration/{auth,projects,tasks,actions}.test.ts, e2e/*
文書      README.md, docs/design.md, docs/er-diagram.md, docs/progress.md
```

### テスト結果（2026-10-30、ローカル Windows 11 / Node.js 24.21.0）

| 種別 | コマンド | 結果 |
|---|---|---|
| ESLint | `npm run lint` | エラー 0 |
| 型チェック | `npm run typecheck` | エラー 0 |
| 単体テスト | `npm run test:unit` | **38 件成功**（権限表・進捗率・日付・期限切れ判定） |
| 統合テスト | `npm run test:integration` | **48 件成功**（下記） |
| E2E | `npm run test:e2e` | **10 件成功**（desktop 9 / mobile 1） |
| ビルド | `npm run build` | 成功 |
| 依存の脆弱性 | `npm audit --omit=dev` | 0 件（開発依存の shadcn CLI 経由で low 3 件。実行時には含まれない） |

統合テストの主な観点（実 DB を使用）:

- **認証**: パスワードがハッシュ化されること、重複登録・短すぎる / 長すぎるパスワードの拒否、ログアウト後の Cookie 無効化、偽造 Cookie の拒否
- **パスワード再設定**: 再設定後に旧パスワード不可・既存セッション全無効化、トークンの使い捨て・期限切れ・不正トークンの拒否、有効期限 30 分、未登録メールでも同じ応答でメール未送信、外部 URL へのリダイレクト拒否、信頼されないオリジンからのログイン拒否（CSRF）
- **認可・データ分離**: 他ユーザーのプロジェクト・タスクを閲覧・作成・更新・削除できないこと（NotFound）、Member が Owner 専用操作をできないこと（Forbidden）、他プロジェクトのタスク ID を指定しても操作できないこと、担当者にメンバー外を指定できないこと
- **トランザクション・整合性**: Owner 登録に失敗するとプロジェクトも作成されない、OWNER なし・2 人・唯一の OWNER の削除 / 降格を DB が拒否、プロジェクト削除で関連データが CASCADE 削除
- **Server Actions**: 未ログイン時はすべて拒否され DB が変わらない、不正な入力の項目別エラー、想定外の型・余分なフィールド（他人の ID 等）の無視
- **一覧**: 検索（大文字小文字無視）・絞り込み・期限順（期限なしは最後）・ページ分割・進捗率

E2E の主な観点: 未ログイン時のリダイレクト、偽造 Cookie、登録 → ログアウト → ログイン、入力検証、パスワード再設定画面、プロジェクト・タスクの CRUD と完了・進捗反映、検索、削除確認ダイアログ、**他ユーザーのプロジェクト URL を直接開いても 404**、スマートフォンでのドロワー操作と横スクロールなし

### セキュリティ確認

| 項目 | 状態 |
|---|---|
| パスワードの平文保存 | なし（scrypt。テストで確認） |
| サーバー側の認証・認可 | 全ページ・全 Action で DB のセッションを検証。`proxy.ts` は補助のみ |
| ユーザー間のデータ分離 | クエリは常にユーザーのメンバーシップを条件に含める。統合・E2E で確認 |
| 入力検証 | 全 Action で Zod（クライアントと同じスキーマ）。ID も検証 |
| CSRF | Server Actions（Next.js）、認証 API（Better Auth の Origin 検証。テストで確認） |
| XSS | `dangerouslySetInnerHTML` 不使用。React のエスケープ |
| SQL インジェクション | Prisma のパラメータ化クエリのみ |
| 機密情報 | `.env` は Git 管理外。本番でリセット URL・トークンをログに出さない |
| 総当たり対策 | 認証 API のレート制限（DB 保存）。E2E 実行中に実際に 429 が返ることを確認（その後 E2E のみ `DISABLE_AUTH_RATE_LIMIT=true` で無効化） |
| ヘッダー | X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy、X-Powered-By 無効 |

### 実装中に判明し対応した点

- **Cache Components**: create-next-app 16.4 の既定で有効だったが、無効化した（design.md 3.3）
- **Better Auth の Origin 検証がテスト環境で無効になる**（`NODE_ENV=test` で既定オフ）ため、`advanced.disableOriginCheck: false` を明示して本番と同じ挙動でテストした
- **`(app)/loading.tsx` があると、所属外プロジェクトを開いたときの HTTP ステータスが 200 になる**（ストリーミング開始後の `notFound()`）。E2E で検出し、`loading.tsx` をダッシュボード配下に移動して 404 を返すようにした
- **ポート 5432 はローカルにインストール済みの PostgreSQL が使用中**だったため、Docker の DB はホストのポート 5433 に割り当てた

### 残課題・次フェーズへの申し送り

| # | 内容 | 対応予定 |
|---|---|---|
| 1 | ダッシュボードは仮画面（集計・直近タスク・進捗率は未実装） | Phase 2 |
| 2 | タスクはリスト表示のみ。カンバン・ドラッグ＆ドロップ・列内の並べ替えは未実装（削除後の `position` の詰め直しも Phase 2） | Phase 2 |
| 3 | メンバー追加・削除の UI と処理は未実装（テストでは DB に直接追加）。そのため現状の担当者候補は Owner 本人のみ | Phase 3 |
| 4 | パスワード再設定の E2E（メール内リンクを開く通し操作）は未実装。統合テストで代替している | Phase 4 |
| 5 | レート制限の自動テストがない（本番設定でのみ有効なため）。手動で 429 を確認済み | Phase 4 で検討 |
| 6 | 登録時に「既に登録されています」と表示するため、メールアドレスの登録有無は登録画面から推測できる（メール認証を導入しない MVP の UX とのトレードオフ。再設定画面では推測できない） | 要件外。必要なら相談 |
| 7 | GitHub Actions はまだ GitHub 上で実行していない（リモート未設定） | リモート作成後に確認 |
| 8 | 本番 DB・Vercel・Resend の設定 | Phase 5 |
