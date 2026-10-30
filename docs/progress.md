# 進捗・フェーズ報告

## Phase 4: 品質向上（2026-10-31 完了）

### 実装内容

| 領域 | 内容 |
|---|---|
| テストの補完 | レート制限（本番と同じルール・DB 保存で 429 を確認）、パスワード再設定の通し E2E（メールのリンク → 新パスワード設定 → 他端末のセッション無効化 → リンクの再利用不可）、タッチ操作のドラッグ E2E（長押しで並べ替え、短いスワイプでは動かない）、Server Action 共通処理・メール送信・書式の単体テスト |
| アクセシビリティ | axe-core（WCAG 2.1 A/AA）で全主要画面・ダイアログをライト / ダークの両方で自動チェック。検出した違反を修正（下記） |
| XSS 対策の強化 | nonce 付きの Content-Security-Policy を全ページに付与（`proxy.ts`）。アプリ自身が CSP 違反を起こさないこと、挿入されたイベントハンドラが実行されないことを E2E で確認 |
| エラー処理 | ルートレイアウトのエラー画面（`global-error.tsx`）を追加。予期しない例外の詳細（接続文字列など）がクライアントに返らないことを単体テストで確認 |
| ローディング | カンバンのスケルトン表示（`board/loading.tsx`） |
| カバレッジ | `npm run test:coverage`（単体 + 統合。UI は E2E で確認するため対象外） |
| ダークモード | テーマ切替の E2E、ダークモードでのアクセシビリティチェック |

### アクセシビリティの修正

| 違反 | 修正 |
|---|---|
| カンバンのカードが「ボタンの中にボタン」（nested-interactive）で、読み上げ名と表示が不一致 | カード全体をボタンにするのをやめ、キーボード・読み上げ用の**ドラッグハンドル**（「タスク『…』を移動」）と、詳細を開くタスク名ボタンを並べた構造に変更。マウス・タッチではカード全体を引き続きドラッグ可能 |
| トーストの文字と背景のコントラスト不足（sonner の richColors） | richColors をやめ、標準の配色に（種類はアイコンで区別） |
| ダッシュボードの「期限切れ」タイルのラベルのコントラスト不足 | 色付き背景の上では本文色に変更 |
| 削除ボタン（destructive）のコントラスト不足（shadcn の淡い赤背景＋赤文字） | 塗りつぶしの赤＋白文字に変更（ダークモードは濃い赤） |

### 主な変更ファイル

```
追加  e2e/{accessibility,password-reset,security}.spec.ts, e2e/db.ts
      tests/integration/rate-limit.test.ts
      src/lib/{action-result,mail}.test.ts, src/i18n/format.test.ts, src/proxy.test.ts
      src/app/global-error.tsx, src/app/(app)/projects/[projectId]/board/loading.tsx
変更  src/proxy.ts（CSP、全ページに適用。ログイン誘導は保護パスのみ）, src/app/layout.tsx（nonce、トースト）
      src/lib/auth/auth.ts（レート制限のルールと有効条件を切り出し）
      src/features/board/components/kanban-card.tsx（ドラッグハンドル）
      src/features/dashboard/components/stat-tiles.tsx, src/components/ui/button.tsx（コントラスト）
      src/i18n/messages/ja.ts, e2e/{board,mobile}.spec.ts
      vitest.config.mts（カバレッジ）, eslint.config.mjs（生成物を除外）, package.json
      README.md, docs/{design,progress}.md
```

追加した開発用依存（すべてバージョン固定）: `@axe-core/playwright@4.14.0`, `@vitest/coverage-v8@5.0.5`, `pg@8.23.1` / `@types/pg@8.23.1`（E2E でテスト用 DB から再設定トークンを読むため。本体では既に間接依存）

### テスト結果（2026-10-31、ローカル）

| 種別 | 結果 |
|---|---|
| ESLint / 型チェック / ビルド | エラー 0・警告 0 / エラー 0 / 成功 |
| 単体テスト | **93 件成功**（+29） |
| 統合テスト | **88 件成功**（+4：レート制限） |
| E2E | **25 件成功**（+8：アクセシビリティ 4、パスワード再設定、CSP 2、タッチ操作）。全件を **3 回連続**で実行して安定を確認 |
| カバレッジ（単体 + 統合、UI 除く） | 文 84.7% / 分岐 86.8% / 関数 80.0% / 行 84.3% |
| 依存の脆弱性 | `npm audit --omit=dev` 0 件 |

要件 7 章の E2E 項目（ユーザー登録・ログイン・プロジェクト作成・タスク作成・カンバン操作・タスク完了・他ユーザーのデータへのアクセス拒否）はすべて自動テスト化済み。

### セキュリティ確認

| 項目 | 状態 |
|---|---|
| CSP | 全ページに付与。リクエストごとに nonce が変わる。本番では `unsafe-inline` / `unsafe-eval` をスクリプトに許可しない |
| レート制限 | 本番設定で 429 になることを自動テストで確認。IP は `X-Forwarded-For` から取得するため、Vercel のようにプラットフォームがこのヘッダーを上書きする環境が前提（自前のサーバーで公開する場合は要注意） |
| 本番のログ | リセット URL・トークンを出さないことを単体テストで確認（送信成功・設定不足・送信エラー・通信例外の各ケース） |
| エラー詳細 | 予期しない例外の内容はクライアントに返さない（単体テスト） |

### 実装中に判明し対応した点

- **E2E が全件実行時だけ失敗することがあった**（カンバン 1 件・アクセシビリティ 1 件）。単独では再現しなかったため、全件を繰り返し実行して原因を特定:
  - カンバン: 追加したスケルトン表示により、ストリーミング中に一時的に**非表示の要素**としてカードが挿入され、その瞬間に位置を取得していた。表示を待ってから操作するよう修正（アプリの不具合ではない。ハイドレーションでの要素の置き換えがないことも確認）
  - アクセシビリティ: `?task=` への遷移中、ページタイトルのストリーミング前に検査していた。遷移完了を待ってから検査するよう修正
- **CSP のテストで、JavaScript から作成したスクリプトが実行された**: `strict-dynamic` の仕様（信頼済みのスクリプトが作成したスクリプトは許可される）によるもので正常。実際の XSS で使われる「挿入されたマークアップのイベントハンドラ」が実行されないことを確認するテストに変更

### 残課題・次フェーズへの申し送り

| # | 内容 | 対応予定 |
|---|---|---|
| 1 | タッチ操作は Chrome のタッチイベントで自動テスト済みだが、実機（iOS Safari 等）での確認は未実施 | Phase 5 の公開後に実機で確認 |
| 2 | GitHub Actions の実行結果を未確認（`gh` 未導入のため） | 確認をお願いしたい |
| 3 | 更新履歴の表示は 50 件まで | 必要になれば対応 |
| 4 | 本番 DB（Neon）・Vercel・Resend・デモアカウント・ER 図 / アーキテクチャ図の公開・API 設計資料（Server Actions 一覧） | Phase 5 |

---

## Phase 3: チーム機能（2026-10-30 完了）

### 実装内容

| 領域 | 内容 |
|---|---|
| メンバー管理 | `/projects/[projectId]/members`（新規画面）。全メンバーが一覧を閲覧でき、Owner のみ登録済みユーザーをメールアドレスで追加・削除できる。Owner は削除不可 |
| メンバー削除時の整合性 | 担当タスクの未割り当て化・履歴の記録・メンバーシップの削除を 1 トランザクションで実行。プロジェクト行のロックにより、同時に行われる担当者の設定と直列化 |
| 担当者設定 | 追加したメンバーを担当者に設定可能（メンバー以外は従来どおりサーバー側で拒否） |
| コメント | タスク詳細で投稿・表示。自分のコメントのみ編集・削除（削除は確認ダイアログ）。編集済みの表示 |
| 更新履歴 | タスク作成・ステータス・担当者・期限・優先度の変更を、誰が・いつ・何から何に変えたかで記録・表示（新しい順、最大 50 件）。カンバンの列移動も記録 |
| タスク詳細 | URL の `?task=<id>` で開く方式に変更（コメント・履歴をサーバーで取得。リンク共有が可能、Esc で閉じると URL からも消える） |
| デモデータ | シードに更新履歴とコメントを追加 |

### 主な変更ファイル

```
追加  src/domain/activity.ts (+ test)
      src/features/members/{actions,service,queries,schemas}.ts, components/{add-member-form,remove-member-button}.tsx
      src/features/comments/{actions,service,schemas}.ts, components/comment-section.tsx
      src/features/tasks/thread.ts, components/activity-list.tsx
      src/app/(app)/projects/[projectId]/members/page.tsx
      tests/integration/{members,comments-activity}.test.ts, e2e/team.spec.ts
変更  src/features/tasks/service.ts            履歴の記録、ロック取得の順序（ロック → 担当者検証）
      src/features/tasks/components/{task-dialogs,task-detail-dialog,task-section}.tsx  URL 方式の詳細
      src/features/board/components/kanban-board.tsx
      src/app/(app)/projects/[projectId]/{page,board/page}.tsx  ?task の読み込み
      src/domain/permissions.ts (+ test)       comment:view / comment:create
      src/features/projects/components/project-tabs.tsx  「メンバー」タブ
      src/i18n/messages/ja.ts, prisma/seed.ts, tests/integration/actions.test.ts
      README.md, docs/{design,er-diagram,progress}.md
```

### テスト結果（2026-10-30、ローカル）

| 種別 | 結果 |
|---|---|
| ESLint / 型チェック / ビルド | エラー 0 / エラー 0 / 成功 |
| 単体テスト | **64 件成功**（+7：履歴の差分算出、コメント権限） |
| 統合テスト | **84 件成功**（+20：メンバーの追加・削除と権限、同時追加の重複防止、削除時の担当解除と履歴、削除と担当者設定の並行実行、コメントの投稿・編集・削除の権限、更新履歴の内容と同一トランザクション性、各 Action の認証・入力検証） |
| E2E | **17 件成功**（+2：Owner と Member の 2 ユーザーでの一連の操作、タスク詳細 URL の共有と他プロジェクトのタスク ID の拒否）。全件を 2 回連続で実行して安定を確認 |
| 依存の脆弱性 | `npm audit --omit=dev` 0 件 |

### セキュリティ確認

| 項目 | 状態 |
|---|---|
| 新しい Server Action（メンバー追加・削除、コメント投稿・編集・削除） | すべて認証 → Zod → サービス内で認可。未ログイン・権限不足・不正入力をテスト済み |
| メンバー管理の権限 | Owner のみ（Member は Forbidden、メンバー外は NotFound）。Owner の削除は不可（DB トリガーでも保証） |
| コメントの権限 | 投稿者本人のみ編集・削除可（Owner でも他人のコメントは不可） |
| 削除されたメンバー | 直後からプロジェクト・タスク・コメントにアクセスできない（統合テスト・E2E） |
| タスク詳細の URL | `?task` に他プロジェクトのタスク ID を指定しても、そのプロジェクトに属さないため表示しない |
| XSS | コメントはプレーンテキストとして表示（React のエスケープ。改行は CSS で表示） |

### 実装中に判明し対応した点

- **「編集済み」が表示されないことがある**: 作成日時と更新日時の差が 1 秒以上かで判定していたため、作成直後の編集が反映されなかった（E2E で検出）。作成時に両者を同じ値で保存し、「更新日時 > 作成日時」で判定するように修正
- **担当者の検証とロックの順序**: Phase 2 では担当者を検証してからロックしていたため、メンバー削除と競合する余地があった。ロック → 検証の順に変更し、並行実行テストを追加

### 残課題・次フェーズへの申し送り

| # | 内容 | 対応予定 |
|---|---|---|
| 1 | メンバー追加時、Owner はメールアドレスが登録済みかどうかを知ることができる（「見つかりません」と表示するため）。招待方式でない MVP では必要な表示 | 要件外（招待メール方式にする場合は相談） |
| 2 | 更新履歴は 1 タスク 50 件まで表示（それ以前は表示しない） | 必要なら Phase 4 でページ送り |
| 3 | Owner の移譲・Member の自主的な脱退は未対応（設計どおり。2.3 F） | 対象外 |
| 4 | タッチ操作の実機確認、パスワード再設定の通し E2E、レート制限の自動テスト、GitHub Actions の実行 | Phase 4 |
| 5 | 本番環境（DB・Vercel・Resend）、デモアカウント | Phase 5 |

---

## Phase 2: 主要機能（2026-10-30 完了）

### 実装内容

| 領域 | 内容 |
|---|---|
| カンバン | `/projects/[projectId]/board`。未着手 / 進行中 / 完了の 3 列、列ごとの件数とタスク追加ボタン。PC は 3 列並び、スマートフォンは列単位の横スクロール |
| ドラッグ＆ドロップ | dnd-kit 6.3.1。列内の並べ替え・列間の移動（ステータス変更）・空の列への移動。マウス / タッチ（長押し）/ キーボードに対応し、操作内容を日本語で読み上げ |
| 楽観的更新 | ドロップ直後に画面へ反映し、保存に失敗したら元の並びに戻してエラー表示。ドラッグ中・保存中はサーバーからの再描画で並びを上書きしない |
| 並び順の整合性 | 作成・移動・ステータス変更・削除のたびに列内の position を 0 始まりの連番に振り直す。プロジェクト行のロック（`SELECT ... FOR UPDATE`）で同時操作を直列化 |
| タスク詳細 | カード・一覧のタスク名から詳細モーダルを開き、編集・削除へ進める（コメント・更新履歴の欄は Phase 3） |
| 期限管理 | 期限切れ（N 日超過）・今日が期限・期限間近（3 日以内、あと N 日）を色＋アイコン＋文言で表示（ボード・一覧・詳細・ダッシュボード） |
| ダッシュボード | KPI（プロジェクト数・進行中・完了・未完了タスク・期限切れタスク）、直近のタスク（未完了で期限が近い順に 10 件、期限切れを含む）、プロジェクトごとの進捗率（更新日順に 6 件） |
| その他 | ヘッダーの区切り線がずれて表示されていた Phase 1 の不具合を修正（区切り線を削除） |

### 主な変更ファイル

```
追加  src/domain/task-position.ts (+ test)
      src/features/board/components/{kanban-board,kanban-column,kanban-card}.tsx
      src/features/dashboard/{queries.ts, components/stat-tiles.tsx}
      src/features/tasks/components/{due-date,task-detail-dialog,task-dialogs}.tsx
      src/app/(app)/projects/[projectId]/board/page.tsx
      tests/integration/{task-ordering,dashboard}.test.ts, e2e/{board,dashboard}.spec.ts
変更  src/domain/dates.ts (+ test)          期限の状態（getDueState / daysBetween）
      src/features/tasks/{service,actions,schemas,queries}.ts  移動処理・ロック・詰め直し
      src/features/tasks/components/task-section.tsx            詳細モーダル・共通ダイアログ化
      src/app/(app)/dashboard/page.tsx, src/app/(app)/layout.tsx
      src/features/projects/components/project-tabs.tsx       「ボード」タブ
      src/i18n/messages/ja.ts, package.json / package-lock.json（dnd-kit 追加）
      tests/integration/{tasks,actions}.test.ts, e2e/{isolation,mobile}.spec.ts
      README.md, docs/{design,er-diagram,progress}.md
```

### テスト結果（2026-10-30、ローカル）

| 種別 | 結果 |
|---|---|
| ESLint / 型チェック / ビルド | エラー 0 / エラー 0 / 成功 |
| 単体テスト | **57 件成功**（+19：並び順計算、期限の状態・日数差） |
| 統合テスト | **64 件成功**（+16：移動・並べ替え・詰め直し、並行実行時の整合性、移動の認可と入力検証、ダッシュボード集計とデータ分離） |
| E2E | **15 件成功**（+5：マウスでの列移動と並べ替え・再読み込み後の保持、キーボードでの移動、詳細モーダルからの編集・削除、ダッシュボード、スマートフォンでのボード表示）。全件を 2 回連続で実行して安定を確認 |
| 依存の脆弱性 | `npm audit --omit=dev` 0 件 |

ライト / ダーク / スマートフォンの画面をスクリーンショットで目視確認済み。

### セキュリティ確認

| 項目 | 状態 |
|---|---|
| 新しい Server Action（`moveTaskAction`） | 認証 → Zod（ステータスは列挙値、位置は 0 以上の整数）→ サービス内で認可（`task:update`）。未ログイン・メンバー外・不正な入力をテスト済み |
| 生 SQL | ロック用の `$queryRaw` はタグ付きテンプレート（パラメータ化）で、値を文字列連結していない |
| データ分離 | ダッシュボードの全集計は所属プロジェクトのみが対象（他人のプロジェクト・タスクが含まれないことをテスト）。ボードの URL を他ユーザーが開くと 404（E2E） |
| クライアントの値の扱い | 移動先のタスクの所属プロジェクトはサーバー側で解決。クライアントの並び順は「移動先の列と位置」だけを受け取り、最終的な並びはサーバーが DB の最新状態から計算する |

### 実装中に判明し対応した点

- **列内の並べ替えが効かないことがある**: 列全体もドロップ先のため、標準の衝突判定（closestCorners）では列が選ばれていた。ポインターのある列のカードを優先する独自の判定にした
- **連続でドラッグするとドラッグが中断されることがある**: 当初は保存後の再描画のたびにボードを作り直していたため、次のドラッグ中に作り直しが起きると操作が失われていた（E2E が不安定になったことで発見）。ドラッグ中・保存中は再描画を反映しない方式に変更し、3 回連続で安定することを確認した

### 残課題・次フェーズへの申し送り

| # | 内容 | 対応予定 |
|---|---|---|
| 1 | メンバー管理が未実装のため、担当者に選べるのは Owner 本人のみ | Phase 3 |
| 2 | タスク詳細のコメント・更新履歴 | Phase 3 |
| 3 | タッチ操作（長押しドラッグ）は自動テストがなく、実機での確認が必要 | Phase 4 で実機確認 |
| 4 | 同じボードを複数人が同時に開いている場合、他人の操作は再読み込みするまで反映されない（設計どおり。要件 2.3 N） | 対象外 |
| 5 | Phase 1 の残課題 4〜8（パスワード再設定の通し E2E、レート制限の自動テスト、登録画面でのメール登録有無、GitHub Actions の実行、本番環境） | 継続 |

---

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
