# ProjectFlow

個人開発者・小規模チーム（2〜10 人）向けのプロジェクト管理 Web アプリケーションです。
プロジェクト単位でタスクを管理し、進捗・優先度・期限を把握できます。

> **開発状況**: Phase 4（品質向上）まで完了。Phase 5（公開）は本番環境の設定・マイグレーションの仕組みまで実装済みで、公開作業は未実施です。
> 本番 URL（予定）: https://projects.art-full-stack.com
> 詳細は [docs/progress.md](docs/progress.md) を参照してください。

## 主な機能（Phase 3 時点）

- ユーザー登録・ログイン・ログアウト・パスワード再設定（メール）・パスワード変更
- プロジェクトの作成・編集・削除、名前検索・ステータス絞り込み・並べ替え・ページネーション、進捗率表示
- ダッシュボード（プロジェクト数・未完了 / 期限切れタスク数、直近のタスク、プロジェクトごとの進捗率）
- カンバンボード（未着手 / 進行中 / 完了）：ドラッグ＆ドロップで列の移動・並べ替え（マウス・タッチ・キーボード対応）
- タスクの作成・編集・削除・詳細表示（ステータス・優先度・担当者・開始日・期限）、期限切れ・期限間近の表示
- メンバー管理（登録済みユーザーをメールアドレスで追加・削除。削除時は担当タスクを自動で未割り当てに）
- タスクへのコメント（自分のコメントのみ編集・削除可）と更新履歴（誰が・いつ・何を変更したか）
- Owner / Member の権限管理、ユーザー間のデータ分離
- ダークモード、レスポンシブ対応（スマートフォンではサイドバーをドロワー表示、カンバンは長押しでドラッグ）
- アクセシビリティ: キーボードだけでカンバンを操作可能、全主要画面で WCAG 2.1 AA の自動チェック（axe-core）を実施

## 技術構成

| 分類 | 技術 |
|---|---|
| フレームワーク | Next.js 16（App Router、Server Components、Server Actions） |
| 言語 / UI | TypeScript 5.9、React 19、Tailwind CSS v4、shadcn/ui、Lucide React |
| DB / ORM | PostgreSQL 18、Prisma 7（`@prisma/adapter-pg`） |
| 認証 | Better Auth（メール＋パスワード、DB セッション） |
| バリデーション / フォーム | Zod 4、React Hook Form |
| ドラッグ＆ドロップ | dnd-kit（core / sortable） |
| テスト | Vitest（単体・統合）、Playwright（E2E） |
| CI / マイグレーション | GitHub Actions |
| 本番環境 | Vercel、Neon（PostgreSQL）、Resend（メール） |

バージョンはすべて `package.json` で固定しています。選定理由（Auth.js から Better Auth への変更など）は [docs/design.md](docs/design.md) を参照してください。

## アーキテクチャ概要

```
ブラウザ ─▶ proxy.ts（Cookie が無ければ /login へ誘導するだけ）
        ─▶ Server Components ─▶ requireUser()（DB でセッション検証）─▶ queries.ts ─▶ Prisma ─▶ PostgreSQL
        ─▶ Server Actions    ─▶ 認証 → Zod 検証 → service.ts（認可 + トランザクション）─▶ Prisma
        ─▶ /api/auth/*（Better Auth）
```

- ビジネスロジック（権限表・進捗率・日付判定）は `src/domain/` に純粋関数として分離
- 所属していないプロジェクトへのアクセスは「存在しない」（404）として扱う
- 「各プロジェクトの Owner はちょうど 1 人」を DB トリガーでも保証
- nonce 付きの Content-Security-Policy、認証 API のレート制限（DB 保存）

詳細: [設計書](docs/design.md) / [ER 図](docs/er-diagram.md)

## ローカル環境での起動

### 必要なもの

- Node.js 24.x（`.nvmrc`、`package.json` の `engines`）
- Docker（PostgreSQL 用）

### 手順

```bash
# 1. 依存関係のインストール（Prisma Client も生成されます）
npm install

# 2. 環境変数（BETTER_AUTH_SECRET はランダムな文字列に変更してください）
cp .env.example .env
#   例: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. PostgreSQL の起動（ホストのポート 5433。開発用とテスト用の 2 DB を作成）
docker compose up -d

# 4. マイグレーションとサンプルデータ
npm run db:migrate
npm run db:seed        # demo@example.com / demo-password（Owner）、member@example.com / demo-password（Member）

# 5. 開発サーバー
npm run dev            # http://localhost:3000
```

開発環境ではパスワード再設定メールは送信されず、リセット URL がサーバーのコンソールに出力されます。

### 環境変数

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | アプリの DB 接続文字列（本番は Neon の Pooled Connection） |
| `DIRECT_URL` | Prisma のマイグレーション用（Neon の Direct Connection）。ローカルでは不要 |
| `TEST_DATABASE_URL` | 統合テスト・E2E 用 DB（テスト実行時にデータが削除されます。`DATABASE_URL` と同じ値は不可） |
| `BETTER_AUTH_SECRET` | セッション署名用の秘密鍵（32 文字以上） |
| `BETTER_AUTH_URL` | アプリの URL（例: `http://localhost:3000`） |
| `RESEND_API_KEY` / `MAIL_FROM` | パスワード再設定メールの送信（本番では必須） |

本番・Preview の環境変数（`PRODUCTION_DB_ENDPOINT_ID`、`PREVIEW_MAIL_ALLOWED_RECIPIENTS` を含む）と設定手順は [docs/deployment.md](docs/deployment.md) を参照してください。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` / `build` / `start` | 開発サーバー / 本番ビルド / 本番サーバー |
| `npm run lint` / `typecheck` | ESLint / TypeScript 型チェック |
| `npm test` | 単体テスト + 統合テスト |
| `npm run test:unit` | 単体テスト（DB 不要） |
| `npm run test:coverage` | 単体 + 統合テストのカバレッジ（`coverage/index.html`） |
| `npm run test:integration` | 統合テスト（テスト用 DB にマイグレーションを適用してから実行） |
| `npm run test:e2e` | E2E テスト（本番ビルドをポート 3100 で起動して実行。初回は `npx playwright install chromium`） |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | マイグレーション作成・適用 / 適用のみ / サンプルデータ（localhost のみ）/ Prisma Studio |

## ディレクトリ構成

```
src/
├── app/            # ルーティング（(auth): 認証画面、(app): ログイン必須画面）
├── components/     # 共通 UI（ui/ は shadcn/ui の生成物）
├── domain/         # 純粋関数のビジネスロジック + 単体テスト
├── features/       # 機能ごとの actions / service / queries / schemas / components
├── i18n/           # UI 文言・日付書式（将来の英語対応に備えて集約）
├── lib/            # DB、認証、エラー処理などの基盤
└── proxy.ts
prisma/             # スキーマ、マイグレーション、シード、CLI の接続先の決定（migration-url.ts）
scripts/            # GitHub Actions から実行するスクリプト
tests/integration/  # 統合テスト（実 DB）
e2e/                # E2E テスト
docs/               # 設計書・ER 図・本番環境の手順・進捗報告
```

## CI

Pull Request と main への push で GitHub Actions が以下を実行します（[.github/workflows/ci.yml](.github/workflows/ci.yml)）。

1. 依存関係のインストール → ESLint → 型チェック → 単体テスト → ビルド
2. 統合テスト（PostgreSQL サービスコンテナ）
3. E2E テスト（PostgreSQL サービスコンテナ + Chromium）

本番 DB へのマイグレーションと本番デプロイは、手動実行・承認付きのワークフロー（[.github/workflows/migrate.yml](.github/workflows/migrate.yml)）で行います。手順は [docs/deployment.md](docs/deployment.md) を参照してください。
