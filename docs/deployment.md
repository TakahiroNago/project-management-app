# 本番環境の構築・運用手順

ProjectFlow を Vercel + Neon + Resend で公開するための手順と運用ルールです。
**秘密情報（接続文字列・API キー・シークレット）は、このリポジトリ・チャット・Issue に書かず、各サービスの設定画面に直接入力してください。**

## 1. 全体構成

| 環境 | URL | DB（Neon） | メール | デプロイ |
|---|---|---|---|---|
| Production | `https://projects.art-full-stack.com` | 本番ブランチ | 全ユーザーに送信 | GitHub Actions のマイグレーション成功後に Deploy Hook で開始 |
| Preview | Vercel が発行する URL（`*.vercel.app`） | Preview ブランチ | 許可リストの宛先のみ | main 以外のブランチへの push で自動 |
| ローカル | `http://localhost:3000` | Docker の PostgreSQL | 送信せずコンソールに URL を出力 | — |

```
GitHub (main) ──▶ GitHub Actions「Database migration」（手動実行・承認）
                     ├─ 接続先の検査（scripts/check-migration-target.ts）
                     ├─ prisma migrate deploy（DIRECT_URL）
                     └─ 成功時のみ Vercel Deploy Hook ──▶ Vercel Production ──▶ Neon 本番（Pooled）
GitHub (他ブランチ) ──▶ Vercel Preview ──▶ Neon Preview ブランチ（Pooled）
```

### PostgreSQL のバージョン

すべての環境で **PostgreSQL 18** を使います（2026-10-31 に 17 から変更）。

| 環境 | PostgreSQL | 指定している場所 |
|---|---|---|
| 本番（Neon の `production` ブランチ） | 18 | Neon のプロジェクト作成時に決まる（プロジェクト `nameless-flower-97327417`） |
| Preview（Neon の Preview ブランチ） | 18 | ブランチは同じプロジェクトのバージョンを使う |
| ローカル（Docker） | 18 | `docker-compose.yml` の `postgres:18-alpine` |
| CI（GitHub Actions のサービスコンテナ） | 18 | `.github/workflows/ci.yml` の `postgres:18-alpine`（統合テスト・E2E の 2 か所） |

- Prisma 7 は PostgreSQL 18 に対応している（Prisma の公式の対応表で確認）
- メジャーバージョンを上げる場合は、Neon・`docker-compose.yml`・`ci.yml` を同時に変更し、ローカルと CI のテストで確認する

### ローカルの PostgreSQL（Docker のボリューム）

- PostgreSQL 18 以降の公式イメージは、データを `/var/lib/postgresql/18/docker` に置き、ボリュームを `/var/lib/postgresql` にマウントする（17 以前は `/var/lib/postgresql/data`）
- メジャーバージョンが違うとデータの形式が異なり、17 のデータを 18 でそのまま開けない。そのため、18 では新しいボリューム `project-management-app_pgdata18` を使う
- 17 のときのボリューム `project-management-app_pgdata` は**削除せずに残している**。17 の開発用 DB の内容は、`pg_dump` で取り出して 18 の開発用 DB に復元済み（テスト用 DB はテストのたびに作り直すため復元していない）
- 旧ボリュームが不要になったら、各自の判断で削除する: `docker volume rm project-management-app_pgdata`（元に戻せない）
- 新しく環境を作る場合は `docker compose up -d` だけでよい（初回起動時にテスト用 DB も作成される）

### 実行環境の判定

アプリは Vercel が設定する `VERCEL_ENV` で環境を判定します（`src/lib/env.ts`）。

| `VERCEL_ENV` | 判定 | 起動時の環境変数検証 | レート制限 |
|---|---|---|---|
| `production` | production | あり（不足・誤設定なら起動しない） | 常に有効 |
| `preview` | preview | あり | 常に有効 |
| 上記以外の値・未設定で、`VERCEL=1`（Vercel 上） | **preview**（制限の厳しい側に倒す） | あり（preview として） | 常に有効 |
| なし（ローカル・CI） | local | 本番ビルド（`NODE_ENV=production`）がリモートの DB を使っていないかのみ | `next start` のときのみ有効 |

- Vercel のシステム環境変数が無効で `VERCEL_ENV` も `VERCEL` も無い場合は local と判定されますが、本番ビルドがリモートの DB に接続しようとすると起動・接続を拒否します。そのため、Production・Preview の検証を経ずに動くことはありません
- ローカルで `next start`（本番ビルド）をリモートの DB に向けて動かすことはできません（開発サーバー `npm run dev` は可能）。`vercel dev` は `VERCEL=1` が設定されるため preview として検証されます（本プロジェクトでは使いません）

起動時の検証は `src/instrumentation.ts` で行います。問題があると、サーバーはリクエストを受け付けず（HTTP 500）、ログには**変数名だけ**が出力されます（値は出力しません）。

## 2. Neon（データベース）

### 2.1 プロジェクトとブランチ

1. Neon でプロジェクトを作成する。リージョンは利用者に近い場所を選び、**Vercel の関数のリージョンも同じか最も近い場所に設定する**（5 章）。PostgreSQL のバージョンは **18**（作成済みの本番プロジェクトが 18。ローカル・CI も 18 に統一している。1 章「PostgreSQL のバージョン」）
2. 既定のブランチを**本番ブランチ**とする
3. **本番にユーザーデータが入る前に**、本番ブランチから Preview 用のブランチ（例: `preview`）を作成する
   - Neon のブランチは作成時点の作成元のデータをそのまま引き継ぐため（コピーオンライト。物理的な全件コピーはしないが、データは見える）、公開後に本番から作り直すと本番ユーザーの個人情報が Preview に入ってしまう。**公開後に Preview ブランチを本番から作り直さないこと**（作り直す場合は、スキーマのみのブランチを作成するか、作成後にデータを全削除する）
   - **Preview ブランチで「Reset from parent」を使わないこと**。親ブランチ（本番）の最新のスキーマと**データ**で置き換えるため、本番の個人情報が Preview に入る
   - スキーマのみのブランチ（`neon branches create --schema-only`。現在 Beta）は、親を持たない独立したルートブランチになる。そのため「Reset from parent」は使えず、作成できる数はプランのルートブランチの上限に含まれる
4. 各ブランチは専用のコンピュート（エンドポイント）を持つ。アプリの DB 分離チェック（`PRODUCTION_DB_ENDPOINT_ID`）は、このエンドポイント ID の違いを利用している
5. **Preview ブランチにだけ存在するロール**（例: `preview_app`）を作成し、Preview 環境ではそのロールの接続文字列を使う
   - ブランチは作成元のロールを引き継ぐため（**未確認**: Neon の資料で確認できていない。設定時に、Neon の画面で Preview 専用ロールが本番ブランチに存在しないことを確認すること）、作成元のロールの接続文字列は Preview でも本番でも使えてしまう。Preview 専用のロールを使えば、その接続文字列で本番ブランチにはログインできない（認証情報のレベルで分離される）

### 2.2 取得する接続文字列

Neon の「Connect」画面で、ブランチ・ロールごとに次の 2 種類を取得します。

| 種類 | ホスト名の形 | 用途 | 設定先 |
|---|---|---|---|
| **Pooled connection** | `ep-xxxx-pooler.<region>.aws.neon.tech` | アプリの通常の接続（`DATABASE_URL`） | Vercel |
| **Direct connection** | `ep-xxxx.<region>.aws.neon.tech` | Prisma のマイグレーション（`DIRECT_URL`） | GitHub Secrets |

必要な組み合わせは次の 4 つです（いずれも `sslmode=require` 付きのもの）。

| | Pooled（`DATABASE_URL`） | Direct（`DIRECT_URL`） |
|---|---|---|
| 本番ブランチ | Vercel の Production | GitHub Environment `production` |
| Preview ブランチ（`preview_app`） | Vercel の Preview | GitHub Environment `preview` |

Neon CLI を使う場合、`neon connection-string <ブランチ名>` は既定で **Direct** の接続文字列を返します。どちらの場合も、ホスト名に `-pooler` が付いているかで Pooled / Direct を見分けてください。

> **このリポジトリで `neon env pull` を実行しないでください。** `.env`（無ければ `.env.local`）に `DATABASE_URL`（Pooled）と `DATABASE_URL_UNPOOLED`（Direct）などを書き込みます。`neon link`・`neon checkout`・`neon deploy`（`neon config apply`）も既定で同じ書き込みを行い、`neon init` も初期設定の中で行います。ローカルの `.env` は Docker の DB 用で、リモートの接続情報を置かない方針です（2.3）。`.env.local` に書き込まれた場合も、Next.js の開発サーバーはそちらを優先して読み込むため、`npm run dev` がリモートの DB に接続してしまいます。
>
> ProjectFlow は Neon の `neon.ts`（インフラの設定ファイル）・Neon Auth・Neon Functions を使いません。Neon の設定は Neon の画面で行い、接続文字列は 2.2 の表のとおり Vercel と GitHub にだけ登録してください。Neon CLI で操作する場合は、`neon link` / `neon checkout` に `--no-env-pull` を付けてください。

あわせて、**本番ブランチのエンドポイント ID**（ホスト名の先頭の `ep-xxxx` の部分。`-pooler` は含めない）を控えます。秘密情報ではありませんが、Preview から本番 DB への接続を拒否するために使います（`PRODUCTION_DB_ENDPOINT_ID`）。

### 2.3 Pooled と Direct を分ける理由

- アプリはサーバーレス環境で動き、インスタンスごとに接続を作るため、接続数の上限に達しにくい Pooled Connection（PgBouncer）を使う
- マイグレーションは Direct Connection を使う。Pooled Connection は PgBouncer のトランザクションモードで、セッション単位の操作に対応していない。経由すると、プールが原因だとは分からない形で失敗する（例: Prisma Migrate の `prepared statement "s0" already exists`、`SET` が次のクエリに引き継がれない）
- Prisma 7 では `schema.prisma` の `directUrl` が廃止されたため、Prisma CLI の接続先は `prisma.config.ts` の `datasource.url` で指定する。本プロジェクトでは `prisma/migration-url.ts` で次のように決める

| 状況 | Prisma CLI の接続先 |
|---|---|
| `DIRECT_URL` あり | `DIRECT_URL`（Pooled Connection なら**エラーで停止**） |
| `DIRECT_URL` なし、`DATABASE_URL` が localhost | `DATABASE_URL`（ローカル開発・テスト・CI） |
| `DIRECT_URL` なし、`DATABASE_URL` がリモート | **なし**。`migrate` 系のコマンドは「datasource.url が必要」というエラーで停止する |

`prisma generate` は接続先を必要としないため、Vercel のビルド（`DIRECT_URL` なし）でも成功します。

> Neon の資料には「Prisma は `url` と `directUrl` を指定する」という記述がありますが、これは Prisma 6 までの方法です。Prisma 7 では `schema.prisma` の `directUrl` が廃止されたため、本プロジェクトでは上の表のとおり `prisma.config.ts` で切り替えています。

また、接続先がローカル（localhost）以外のときは、`prisma migrate dev`（`npm run db:migrate`）・`prisma migrate reset`・`prisma db push` を設定の読み込み時に拒否します。これらは開発用で、DB のリセット（全データの削除）を伴うことがあるためです。リモートの DB には GitHub Actions の `prisma migrate deploy` だけを使います。**ローカルの `.env` にリモートの `DIRECT_URL` を書かないでください。**

### 2.4 コンピュートの自動停止（Scale to zero）

- アイドル状態が続くと、コンピュートは自動で停止する（既定 5 分。時間は変更できる。停止しない設定は Launch / Scale プランのみ）
- 停止後の最初のクエリは、起動のため数百ミリ秒ほど遅くなる。公開直後やアクセスの少ない時間帯は、最初の表示が遅くなることがある
- 停止中もデータ（ストレージ）は保持される
- ログイン直後の表示などで遅さが問題になる場合は、プランと停止までの時間を見直す

## 3. Better Auth

### 3.1 BETTER_AUTH_SECRET の生成と設定

Production と Preview で**別々の値**を生成します（どちらも 32 文字以上）。

```bash
# どちらか一方
openssl rand -base64 32
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- 生成した値は、そのまま Vercel の環境変数の画面に貼り付ける（ファイル・チャット・シェルの履歴に残さない。共有の端末では履歴を消す）
- Vercel では「Sensitive」として登録し、設定後は画面から読み出せないようにする
- 値を変更すると、全ユーザーのセッションが無効になる（全員が再ログインになる）。漏えいが疑われる場合はすぐに変更する

### 3.2 BETTER_AUTH_URL と Origin 検証

| 環境 | `BETTER_AUTH_URL` | 基準 URL（再設定メールのリンク） | 信頼するオリジン |
|---|---|---|---|
| Production | `https://projects.art-full-stack.com` | 本番ドメイン | 本番ドメインのみ |
| Preview | **設定しない**（設定されていると起動しない） | そのデプロイのブランチ URL（`VERCEL_BRANCH_URL`） | そのデプロイ自身の URL（`VERCEL_BRANCH_URL` と `VERCEL_URL`）のみ |

- Preview では `*.vercel.app` のようなワイルドカードを使わず、そのデプロイ自身の URL だけを信頼する（`src/lib/auth/origins.ts`）。他のデプロイや第三者のサイトからは認証 API を呼べない
- Preview の再設定メールのリンクは Preview の URL になり、本番ドメインを指さない
- `VERCEL_URL` / `VERCEL_BRANCH_URL` は Vercel のシステム環境変数。プロジェクト設定の「Automatically expose System Environment Variables」を有効にしておく（既定で有効）

## 4. Resend（メール）

1. Resend に送信用ドメイン `mail.art-full-stack.com` を追加し、表示される DNS レコード（SPF・DKIM。MX を含む場合あり）を DNS に登録して認証する。DMARC レコードの追加も推奨
2. API キーを **Production 用と Preview 用で別々に**作成する。権限は「Sending access」、対象ドメインは `mail.art-full-stack.com` に限定する
3. `MAIL_FROM` は `ProjectFlow <no-reply@mail.art-full-stack.com>` とする

### Preview でのメール送信制限

- Preview では、`PREVIEW_MAIL_ALLOWED_RECIPIENTS`（カンマ区切りのメールアドレス。完全一致）に含まれる宛先にだけ送信する。**未設定なら誰にも送信しない**
- 許可されない宛先の場合は送信せず、宛先も URL もログに出さない
- Preview にメールの設定（`RESEND_API_KEY`）が無い場合も、送信しない

## 5. Vercel

### 5.1 プロジェクトの設定

1. GitHub のリポジトリをインポートする（Framework: Next.js、ビルドコマンドは既定の `npm run build`）
2. Node.js のバージョン: Settings → Build and Deployment → Node.js Version を **24.x** にする。`package.json` の `engines`（`24.x`）が優先されるが、画面の設定と食い違うとビルド時に警告が出るため揃えておく（`.nvmrc`・CI も 24）
3. Domains に `projects.art-full-stack.com` を追加し、指示に従って DNS（CNAME）を設定する
4. Functions のリージョンを Neon と同じか最も近いリージョンに設定する
5. Deployment Protection（Vercel Authentication）を Preview に対して有効のままにする（第三者に Preview を見せない）
6. **Deploy Hook** を作成する（Settings → Git → Deploy Hooks。ブランチは `main`）。URL は秘密情報として GitHub Secrets に登録する（6 章）。URL を知っていれば誰でもデプロイを開始できるため、漏えいした場合はすぐに削除して作り直す

#### 本番の `*.vercel.app` の URL ではログインできない

本番のデプロイには `projects.art-full-stack.com` のほかに、Vercel が発行する URL（`<project>.vercel.app`、デプロイごとの `<project>-<hash>-<team>.vercel.app`）でもアクセスできます。Better Auth は本番では `BETTER_AUTH_URL` だけを信頼するため、**これらの URL からはログイン・登録・パスワード再設定ができません**（Origin 検証で拒否されます。意図どおりの動作です）。

- 利用者には本番ドメインだけを案内する
- Vercel の Domains で `<project>.vercel.app` を本番ドメインへリダイレクトする設定を推奨
- デプロイごとの URL は Deployment Protection（Standard Protection）で保護されるため、第三者は開けない

### 5.2 main への push による自動デプロイを止める

`vercel.json` で `main` ブランチの自動デプロイを無効にしています。本番へのデプロイは GitHub Actions のマイグレーションが成功した後に、Deploy Hook で開始します（マイグレーション前の新しいコードが本番 DB で動くのを防ぐ）。main 以外のブランチの Preview は自動でデプロイされます。

> 初回の設定時に、Deploy Hook で本番デプロイが作成されることを確認してください。

### 5.3 環境変数

| 変数 | Production | Preview | Sensitive |
|---|---|---|---|
| `DATABASE_URL` | 本番ブランチの **Pooled** | Preview ブランチ（`preview_app`）の **Pooled** | ✅ |
| `PRODUCTION_DB_ENDPOINT_ID` | 本番ブランチのエンドポイント ID | 同じ値（本番 DB を検出するため） | — |
| `BETTER_AUTH_SECRET` | 本番用に生成した値 | Preview 用に生成した**別の値** | ✅ |
| `BETTER_AUTH_URL` | `https://projects.art-full-stack.com` | **設定しない** | — |
| `RESEND_API_KEY` | 本番用のキー | Preview 用のキー（任意） | ✅ |
| `MAIL_FROM` | `ProjectFlow <no-reply@mail.art-full-stack.com>` | 同じ（`RESEND_API_KEY` を設定する場合は必須） | — |
| `PREVIEW_MAIL_ALLOWED_RECIPIENTS` | 設定しない | 開発者のメールアドレス（任意） | — |

**設定してはいけない変数**: `DIRECT_URL`（アプリには不要。マイグレーションは GitHub Actions でのみ行う）、`DISABLE_AUTH_RATE_LIMIT`（設定されていると起動しない）、`TEST_DATABASE_URL`。

環境変数は、環境（Production / Preview）を選んで個別に登録します。「All Environments」で登録しないでください（Preview に本番の値が入るのを防ぐため）。

## 6. GitHub（マイグレーション）

### 6.1 Environments と Secrets

Settings → Environments で 2 つの環境を作成します。

| Environment | 保護ルール | Secrets |
|---|---|---|
| `production` | **Required reviewers**（承認者を指定）、Deployment branches を `main` のみに制限 | `DIRECT_URL`（本番ブランチの Direct）、`VERCEL_DEPLOY_HOOK_URL` |
| `preview` | なし | `DIRECT_URL`（Preview ブランチ・`preview_app` の Direct） |

Settings → Secrets and variables → Actions → **Variables** に、リポジトリ変数 `PRODUCTION_DB_ENDPOINT_ID`（本番ブランチのエンドポイント ID）を登録します。

- Secrets は Environment ごとに登録する（リポジトリ全体の Secret にしない）。承認されたジョブだけが本番の接続情報を参照できる
- GitHub Actions は Secrets の値をログ上で自動的に伏せ字にする。ワークフローでも値を出力しない
- 通常の CI（`ci.yml`）は本番の Secrets を使わない（ダミーの値とサービスコンテナの DB のみ）
- **保護ルールはワークフロー側でも検査します**（6.2）。ワークフローが存在しない Environment を指定すると、GitHub は保護ルールの無い Environment を自動で作成するため、設定漏れのまま承認なしで動くのを防ぎます
- 承認者には自分自身を指定できます（1 人で運用する場合は「Prevent self-review」を有効にしない）
- このリポジトリは公開リポジトリのため、承認者の設定（Required reviewers）を無料で利用できます。**非公開にする場合は、プランによって承認者の設定が使えなくなり、保護ルールの検査で必ず停止します**

### 6.2 ワークフロー（`.github/workflows/migrate.yml`）

手動実行（`workflow_dispatch`）のみです。入力は `target`（`preview` / `production`）と `deploy`（成功後に本番デプロイを開始するか）。ジョブは 2 つに分かれています。

**preflight ジョブ**（Environment・Secrets を使わない）

1. production の場合は `main` ブランチからの実行か確認する
2. production の場合、GitHub API（読み取りのみ。`GITHUB_TOKEN`）で `production` Environment の保護ルールを確認する（`scripts/release-guard.ts environment-protection`）
   - Required reviewers があり、承認者が 1 人以上いること
   - Deployment branches が「Selected branches and tags」で、許可されたブランチが `main` だけであること（ワイルドカード・タグ・「Protected branches only」は不可）
   - **Environment が存在しない・API のエラー・通信エラー・想定外の応答の場合も停止する**
3. production の場合、実行中のコミット（`GITHUB_SHA`）が `main` の最新コミットと一致するか確認する（`commit-is-head`）

preflight が失敗すると migrate ジョブは開始されず、Environment の承認依頼も Secrets の受け渡しも行われません。

**migrate ジョブ**（`target` の Environment を使う。production は承認されるまで待機）

1. `npm ci`（接続情報は渡さない）
2. DB のホスト名・エンドポイント ID をログで伏せ字にする（`scripts/mask-database-host.ts`。公開リポジトリのログは誰でも閲覧できるため）
3. 接続先の検査（`scripts/check-migration-target.ts`）
   - `DIRECT_URL` が Neon の Direct Connection であること（Pooled ならエラー）
   - production: 本番ブランチ（`PRODUCTION_DB_ENDPOINT_ID`）を指していること
   - preview: 本番ブランチを指していないこと
4. production の場合、保護ルールと `main` の最新コミットを**もう一度**確認する（承認待ちの間の変更に備える。**マイグレーション開始前の確認**）
5. `prisma migrate status`（未適用のマイグレーションの確認）
6. `prisma migrate deploy`（`DIRECT_URL` で実行）
7. production かつ `deploy` が有効なら、`main` の最新コミットが実行中のコミットと一致するか確認してから（**Deploy Hook の直前の確認**）、Deploy Hook で本番デプロイを開始する

どの段階でも失敗した時点でジョブが止まり、以降の段階（マイグレーション・デプロイ）は実行されません。同じ環境へのマイグレーションは同時に実行されません（`concurrency`）。

そのほかの安全策: `inputs.target` はシェルに直接埋め込まず環境変数 `TARGET` で渡す、checkout は認証情報を残さない（`persist-credentials: false`）、利用する Action はコミット SHA で固定（更新するときは、リリースノートを確認してから SHA とコメントのバージョンを書き換える）。

### 6.3 「main has moved」で停止した場合

実行の開始後に `main` へ別のコミットがマージされたため、安全のために停止しています。

- **マイグレーション開始前の確認で停止した場合**: DB は変更されていません。最新の `main` でワークフローを最初から実行し直してください
- **Deploy Hook の直前の確認で停止した場合**: マイグレーションは適用済みで、本番デプロイは開始されていません（本番では古いコードが動き続けます）。追加されたコミットにマイグレーションが含まれるかを確認し、最新の `main` でワークフローを実行し直してください（適用済みのマイグレーションは再適用されず、新しいものだけが適用されてからデプロイされます）

## 7. リリース手順

1. 作業ブランチで開発し、Pull Request を作成する（Preview がデプロイされる。マイグレーションを含む場合は、先に `target: preview` でマイグレーションを実行する）
2. CI（lint・型チェック・単体・統合・E2E）がすべて成功していることを確認して main にマージする
3. **バックアップ用のブランチを作成する**（8 章。マイグレーションを含む場合）
4. **リリース中は main へマージしない**（ワークフローの実行開始から、Vercel の本番デプロイが完了するまで）。複数人で開発する場合は、事前にリリースすることを共有する
5. Actions → 「Database migration」→ Run workflow（ブランチ `main`、`target: production`）
6. 承認者が内容を確認して承認する
7. マイグレーション成功後、自動で本番デプロイが始まる。Vercel で、**デプロイされたコミットがワークフローのコミットと同じであること**とデプロイの完了を確認し、本番でログイン・主要な操作を確認する

マイグレーションが無い変更でも、本番デプロイは同じ手順で行います（`migrate deploy` は何もせずに成功し、デプロイに進みます）。

### 制約: Deploy Hook とコミットのずれ

Deploy Hook はコミットを指定できず、**Vercel が Hook を受け付けた時点の `main` の最新コミット**をデプロイします。ワークフローは Hook を呼ぶ直前に `main` が進んでいないことを確認しますが、**確認してから Vercel がコミットを取得するまでの数秒間にマージされた場合のずれは防げません**。そのため、手順 4（リリース中は main へマージしない）と手順 7（デプロイされたコミットの確認）を必ず守ってください。ずれていた場合は、Vercel の Instant Rollback で直前の本番デプロイに戻し、最新の `main` でワークフローを実行し直します。

完全に防ぐには、Vercel CLI でコミットを指定してデプロイする方法がありますが、アカウント全体に権限が及ぶ `VERCEL_TOKEN` を GitHub に保存する必要があるため、現時点では採用していません。

### Preview のマイグレーション

Preview の DB（Neon の Preview ブランチ）は、**すべての作業ブランチの Preview で共有されます**。あるブランチのマイグレーションを適用すると、他のブランチの Preview も同じスキーマで動きます。

1. 作業ブランチを push する（Preview は自動でデプロイされる。マイグレーションの適用前は古いスキーマで動く）
2. Actions → 「Database migration」→ Run workflow で、**「Use workflow from」に作業ブランチを選び**、`target: preview` で実行する（作業ブランチのマイグレーションが適用される。承認は不要）
3. Preview で動作を確認する
4. 同時に複数のブランチでマイグレーションを作る場合は、適用する順序に注意する（先に main にマージされるもの以外は、Preview への適用を控える）

**Preview に適用したマイグレーションを取り消す場合**（ブランチを破棄した、マイグレーションの内容を変えたなど）:

- 取り消さずに放置すると、Preview の DB にリポジトリに無いマイグレーションが残り、以降の `migrate deploy`（Preview）が失敗したり、スキーマがずれたりする
- 戻し方（いずれかの方法）
  1. Neon で Preview ブランチを、マイグレーションを適用する前の時点に復元する（履歴保持の範囲内の場合。最も簡単）
  2. Preview ブランチの `public` スキーマを作り直して（全テーブルを削除）、main の状態で `target: preview` のマイグレーションを実行し直す。Preview のデータは消える
- **本番ブランチから Preview ブランチを作り直さない・「Reset from parent」を使わないこと**（本番ユーザーの個人情報が Preview に入るため。2.1 参照）
- Preview の DB に対する操作は、Preview ブランチの接続情報で行い、本番ブランチの接続情報を使わない

### マイグレーションの書き方の注意

マイグレーションの適用からデプロイ完了までの間、**古いコードが新しいスキーマで動きます**。そのため、マイグレーションは古いコードと互換性を保つように分けて行います（列の追加 → コードの切り替え → 後のリリースで古い列を削除、の順）。列の削除・名前の変更・NOT NULL の追加を、コードの変更と同じリリースで行わないでください。

## 8. バックアップと復旧

### 8.1 方針

| 項目 | 方針 |
|---|---|
| 継続的なバックアップ | Neon の履歴保持（指定した時点にブランチを復元できる機能）を使う。保持期間はプランによって異なるため、契約しているプランの保持期間を確認して記録しておく |
| マイグレーション前 | 本番ブランチから**バックアップ用のブランチ**（例: `backup-20261101-add-xxx`）を作成してから実行する。消し忘れを防ぐため、作成時に有効期限を付ける（例: `neon branches create --name <名前> --parent <本番ブランチ> --expires-at <2 週間後の日時>`）。バックアップ用のブランチは本番のデータを含むため、接続情報を Preview や GitHub に設定しない |
| 定期的な論理バックアップ | 月 1 回、`pg_dump`（Direct Connection を使う）で取得し、暗号化して DB とは別の場所に保管する。保管期間を決めて古いものは削除する |
| 復旧の目標 | 目標復旧時点: 履歴保持の範囲内なら障害の直前。目標復旧時間: 1 時間以内 |
| 復旧訓練 | 公開前と、その後は四半期に 1 回、本番ブランチの過去の時点から**訓練用の一時ブランチ**（有効期限付き）を作成して手順を確認する。Preview ブランチには復元しない（本番の個人情報が Preview に入るため）。訓練用ブランチの接続情報は Vercel・GitHub に設定せず、確認後に削除する |

### 8.2 復旧手順

1. 影響を確認し、必要なら Vercel で本番を以前のデプロイに戻す（Instant Rollback）か、メンテナンス表示にする
2. Neon で本番ブランチを、障害の直前の時点またはバックアップ用のブランチの状態に復元する
   - 本番ブランチを「その場で」復元すれば、エンドポイント（接続文字列）は変わらないため、Vercel の設定変更は不要（**未確認**: 初回の復旧訓練で、復元後も接続文字列が変わらないことを確認すること）
   - 別のブランチに復元した場合は接続文字列とエンドポイント ID が変わるため、Vercel の `DATABASE_URL`、GitHub の `DIRECT_URL`、`PRODUCTION_DB_ENDPOINT_ID` をすべて更新する
3. `prisma migrate status` でスキーマとマイグレーションの状態を確認する
4. 本番で動作を確認し、影響を受けたユーザーへの連絡が必要か判断する

### 8.3 マイグレーション失敗時

- 失敗した時点でワークフローは止まり、**本番デプロイは開始されない**（本番では古いコードが動き続ける）
- 失敗したマイグレーションは `_prisma_migrations` に記録され、解決するまで `migrate deploy` は再実行できない（失敗したまま次に進むことはない）
- 対応:
  1. ワークフローのログでエラーの内容を確認する（ログに接続情報は出ない）
  2. 一部だけ適用された変更があるか確認する。判断が難しい場合は、8.2 の手順でバックアップ用のブランチの状態に戻すのが最も安全
  3. 原因を修正したマイグレーションを作成し、CI → main → 再度ワークフローを実行する
  4. 部分的な変更を手で戻した場合は、`prisma migrate resolve --rolled-back <マイグレーション名>` で失敗の記録を解消する。本番の接続情報が必要な操作のため、承認者と 2 人で行う

## 9. 公開前のチェックリスト

- [ ] Neon: 本番・Preview ブランチ、Preview 専用ロール、エンドポイント ID の控え
- [ ] Neon: 履歴保持の期間を確認して記録
- [ ] Resend: `mail.art-full-stack.com` の認証、Production・Preview の API キー
- [ ] Vercel: 環境変数（Production / Preview を分けて登録）、独自ドメイン、`*.vercel.app` から本番ドメインへのリダイレクト、関数のリージョン、Node.js 24.x、Deploy Hook、Preview の Deployment Protection
- [ ] GitHub: Environments（`production` の承認者、ブランチ制限は「Selected branches and tags」で `main` のみ）、Secrets、Variables
- [ ] GitHub: 承認者の設定を外した状態で `target: production` を実行し、preflight で停止することを確認（確認後に設定を戻す）
- [ ] `target: preview` でマイグレーションを実行し、Preview で登録・ログイン・再設定メール（許可リストの宛先）を確認
- [ ] `target: production` でマイグレーションと本番デプロイを実行
- [ ] 本番で: HTTPS、ログイン、再設定メールのリンクが本番ドメインであること、ログイン連続失敗で 429 が返ること、CSP などのヘッダー
