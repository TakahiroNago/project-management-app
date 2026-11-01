# アーキテクチャ図

> アプリ内部のレイヤーと責務は [design.md](./design.md) の 3 章、本番環境の設定手順は [deployment.md](./deployment.md)、更新処理の一覧は [server-actions.md](./server-actions.md) を参照。

## 1. システム構成（本番）

```mermaid
flowchart LR
  User[利用者のブラウザ]

  subgraph Vercel["Vercel（関数のリージョン: sin1 シンガポール）"]
    Proxy["proxy.ts<br/>CSP の nonce 付与<br/>Cookie が無ければ /login へ"]
    App["Next.js 16<br/>Server Components / Server Actions"]
    AuthApi["/api/auth/*<br/>Better Auth"]
  end

  subgraph Neon["Neon（PostgreSQL 18、シンガポール）"]
    ProdDB[("本番ブランチ<br/>production_app ロール")]
    PrevDB[("Preview ブランチ<br/>preview_app ロール")]
  end

  Resend["Resend<br/>パスワード再設定メール"]

  subgraph GitHub
    Repo[リポジトリ]
    CI["CI（ci.yml）<br/>lint・型・単体・統合・E2E"]
    Migrate["Database migration（migrate.yml）<br/>手動実行・承認付き"]
  end

  User -- HTTPS --> Proxy --> App
  User -- HTTPS --> AuthApi
  App -- "Prisma（Pooled）" --> ProdDB
  AuthApi -- "Prisma（Pooled）" --> ProdDB
  AuthApi -- "after() で送信" --> Resend

  Repo -- "PR・push" --> CI
  Repo -- "main 以外の push" --> PreviewDeploy["Vercel Preview"] -- Pooled --> PrevDB
  Migrate -- "migrate deploy（Direct）" --> ProdDB
  Migrate -- "成功時のみ Deploy Hook" --> Vercel
```

- 本番 URL: `https://projectflow.art-full-stack.com`（本番の `*.vercel.app` の URL ではログインできない。deployment.md 5.1）
- 関数と DB を同じシンガポールに置き、クエリごとの往復時間を小さくしている（`vercel.json` の `regions`）
- アプリは Pooled Connection・アプリ用ロール（テーブルの読み書きのみ）、マイグレーションは Direct Connection・`neondb_owner` を使う
- Production / Preview は、起動時（`instrumentation.ts`）と DB 接続時（`src/lib/db.ts`）に、接続先のブランチが環境と一致するかを検査する
- main への push では本番に自動デプロイしない（`vercel.json`）。本番デプロイはマイグレーションのワークフロー経由のみ

## 2. 環境

| 環境 | 実行場所 | DB | メール |
|---|---|---|---|
| Production | Vercel（sin1） | Neon 本番ブランチ | Resend（全ユーザー） |
| Preview | Vercel（sin1） | Neon Preview ブランチ | Resend（許可リストの宛先のみ） |
| ローカル | `npm run dev`（Node.js 24） | Docker の PostgreSQL 18（ポート 5433） | 送信せずコンソールに URL を出力 |
| CI | GitHub Actions | サービスコンテナの PostgreSQL 18 | 送信しない |

## 3. アプリ内部の構成

```mermaid
flowchart TB
  subgraph Client["ブラウザ（Client Components）"]
    Form["フォーム<br/>React Hook Form + Zod"]
    Board["カンバン<br/>dnd-kit（楽観的更新）"]
    AuthClient["authClient<br/>（Better Auth）"]
  end

  subgraph Server["サーバー"]
    Pages["src/app/**<br/>ページ・レイアウト（Server Components）"]
    Actions["src/features/*/actions.ts<br/>Server Actions"]
    Queries["src/features/*/queries.ts<br/>読み取り"]
    Services["src/features/*/service.ts<br/>認可 + 更新（トランザクション）"]
    Session["src/lib/auth/session.ts<br/>requireUser / requireActionUser"]
    Authz["src/lib/auth/authorization.ts<br/>authorizeProject"]
    Domain["src/domain/*<br/>権限表・進捗率・日付・並び順（純粋関数）"]
    BA["src/lib/auth/auth.ts<br/>Better Auth（レート制限・入力検証フック）"]
  end

  DB[(PostgreSQL)]

  Form --> Actions
  Board --> Actions
  AuthClient --> BA
  Pages --> Session
  Pages --> Queries
  Actions --> Session
  Actions --> Services
  Queries --> Authz
  Services --> Authz
  Authz --> Domain
  Services --> Domain
  Queries --> DB
  Services --> DB
  Session --> DB
  BA --> DB
```

- 読み取りは Server Components からクエリを直接呼ぶ。更新は Server Actions だけが入口（REST API は作らない）
- 認証（ユーザー登録・ログイン・パスワード関連・プロフィール更新）は Better Auth の API（`/api/auth/*`）をブラウザから呼ぶ
- `src/domain` はフレームワーク・DB に依存しない純粋関数で、単体テストの主な対象

## 4. 主な処理の流れ

### 4.1 画面の表示（読み取り）

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant P as proxy.ts
  participant S as Server Component
  participant A as requireUser
  participant Q as queries.ts
  participant D as PostgreSQL

  B->>P: GET /projects/[id]/board
  alt セッション Cookie が無い
    P-->>B: /login へリダイレクト
  end
  P->>S: nonce を付けて転送（CSP ヘッダー付き）
  S->>A: セッションの検証
  A->>D: セッションを DB で確認（React cache で 1 リクエスト 1 回）
  alt セッションが無効・期限切れ
    A-->>B: /login へリダイレクト
  end
  S->>Q: プロジェクト・タスクの取得（ユーザー ID を条件に含める）
  Q->>D: SELECT
  alt メンバーでない・存在しない
    Q-->>B: 404（存在を隠す）
  end
  S-->>B: HTML（RSC ペイロード）
```

`proxy.ts` は Cookie の有無だけを見る楽観的なチェックで、正当性の検証は必ずサーバー側（`requireUser`）で行う。

### 4.2 更新（Server Action）

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant SA as Server Action
  participant SV as service.ts
  participant D as PostgreSQL

  B->>SA: POST（Next.js が Origin を検証）
  SA->>SA: ① 認証 requireActionUser（失敗: ログインが必要）
  SA->>SA: ② Zod で入力を検証（失敗: 項目ごとのエラー）
  SA->>SV: サービスを呼ぶ
  SV->>D: BEGIN
  SV->>D: ③ 認可 authorizeProject（所属先はサーバー側で解決）
  SV->>D: ④ 更新 + 更新履歴（必要に応じてプロジェクト行をロック）
  SV->>D: COMMIT（途中で失敗すればすべて取り消し）
  SA->>SA: ⑤ revalidatePath
  SA-->>B: ActionResult（ok / error / fieldErrors）
```

- 例外は `runAction` で `ActionResult` に変換する。予期しない例外は詳細をクライアントに返さず、サーバーのログにだけ残す
- 各 Action の内容は [server-actions.md](./server-actions.md)

### 4.3 カンバンのドラッグ＆ドロップ

```mermaid
sequenceDiagram
  autonumber
  participant U as 利用者
  participant K as カンバン（dnd-kit）
  participant SA as moveTaskAction
  participant D as PostgreSQL

  U->>K: ドラッグ（マウス・タッチ・キーボード）
  K->>K: ローカルの並びを即座に更新（楽観的更新）
  U->>K: ドロップ
  K->>SA: { status, index }
  SA->>D: プロジェクト行をロック → 移動元・移動先の列の並びを 1 回の UPDATE で振り直す
  alt 保存に失敗
    SA-->>K: ok: false
    K->>K: ドラッグ前の並びに戻し、トーストを表示
  end
  K->>K: router.refresh() でサーバーの最新状態を反映（ドラッグ中・保存中は反映しない）
```

### 4.4 パスワード再設定

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant BA as Better Auth（/api/auth/*）
  participant D as PostgreSQL
  participant R as Resend

  B->>BA: request-password-reset（5 分に 3 回まで / IP）
  BA->>D: トークンを保存（有効期限 30 分・使い捨て）
  BA-->>B: 常に同じ応答（ユーザーの存在を明かさない）
  BA-)R: after() でメール送信（応答時間からの推測を防ぐ。URL はログに出さない）
  B->>BA: reset-password（トークン + 新しいパスワード）
  BA->>D: パスワードを更新し、既存のセッションをすべて無効化
```

## 5. リリースの流れ

```mermaid
flowchart LR
  Dev[作業ブランチ] -- PR --> CI{CI 成功?}
  Dev -- push --> Preview[Vercel Preview]
  CI -- マージ --> Main[main]
  Main --> Run["Database migration を手動実行<br/>target: production"]
  Run --> Pre["preflight<br/>main の最新か・Environment の保護ルール"]
  Pre --> Approve[承認者が承認]
  Approve --> Check["接続先の検査<br/>保護ルール・main を再確認"]
  Check --> Mig[prisma migrate deploy]
  Mig --> Head[main が進んでいないか再確認]
  Head --> Hook[Deploy Hook] --> Prod[Vercel Production]
```

どの段階でも失敗すれば以降は実行されない。詳細は deployment.md の 6・7 章。
