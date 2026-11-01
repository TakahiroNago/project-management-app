# 進捗・フェーズ報告

## Phase 5: 公開（実施中）

### 2026-10-31: 本番環境の設定・マイグレーションの仕組み（外部サービスの設定・接続・デプロイは未実施）

#### 実装内容

- **環境の判定と起動時の検証**: `VERCEL_ENV` で production / preview / local を判定（`src/lib/env.ts`）。Production / Preview では `instrumentation.ts` で必須の環境変数を検証し、不足・誤設定なら起動しない（メッセージは変数名のみ）
- **DB の分離**: Production は本番ブランチ、Preview は本番以外のブランチでなければ起動・接続しない（`PRODUCTION_DB_ENDPOINT_ID` と比較。起動時と `db.ts` の 2 か所）。アプリの `DATABASE_URL` は Pooled Connection に限定
- **Prisma CLI の接続先**（`prisma/migration-url.ts`）: リモートは `DIRECT_URL` のみ。Pooled ならエラー、`DIRECT_URL` が無ければ接続先なし。`prisma generate` は接続先なしで成功
- **Better Auth**: Production は `BETTER_AUTH_URL` のみ信頼。Preview はそのデプロイ自身の URL だけを baseURL・信頼済みオリジンにする（ワイルドカードなし）。レート制限は Vercel 上では常に有効
- **Preview のメール**: 許可リスト（`PREVIEW_MAIL_ALLOWED_RECIPIENTS`）の宛先にだけ送信
- **GitHub Actions**: `migrate.yml`（手動実行・Environment の承認・接続先の検査・`migrate deploy`・成功時のみ Deploy Hook）。`vercel.json` で main の自動デプロイを無効化
- **その他**: Node.js を `24.x` に統一、シードは localhost の DB でのみ実行可能、テストのマイグレーションで `DIRECT_URL` もテスト用 DB に上書き
- **文書**: [deployment.md](./deployment.md)（Neon・Vercel・Resend・GitHub の設定、秘密鍵の生成、リリース手順、バックアップ・復旧、マイグレーション失敗時の対応）

#### テスト結果

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 143 件成功（+50。環境変数の検証、DB の分離、Origin、マイグレーションの接続先、Preview のメール） |
| 統合テスト | 89 件成功（+1。Vercel 上でレート制限を無効にできないこと） |
| E2E テスト | 25 件成功 |
| カバレッジ（単体 + 統合） | 行 86.4%、分岐 91.0% |

手動での確認（ダミーの接続文字列を使用。外部には接続していない）:

- `DATABASE_URL` が Pooled で `DIRECT_URL` なし → `prisma generate` 成功、`prisma migrate deploy` は「datasource.url が必要」で停止
- `DIRECT_URL` が Pooled → Prisma の設定の読み込み時にエラーで停止（接続文字列はメッセージに含まれない）
- `VERCEL_ENV=production` で必須の変数が不足した状態で `next start` → HTTP 500、ログは変数名のみ
- `scripts/check-migration-target.ts`: preview に本番の接続文字列を指定するとエラー、production に本番を指定すると成功
- リモートの `DATABASE_URL` でシードを実行するとエラーで停止

### 2026-10-31: コミット前レビューの指摘への対応（M1・M2・R1〜R7）

#### 実装内容

- **M1（デプロイするコミットの整合性）**: 実行中のコミット（`GITHUB_SHA`）が main の最新と一致するかを GitHub API で確認し、一致しなければ停止（preflight、マイグレーション直前、Deploy Hook 直前の 3 回）。Deploy Hook の受付から Vercel のコミット取得までの競合は運用（リリース中は main へマージしない・デプロイされたコミットの確認）で防ぐ（deployment.md 7 章）
- **M2（production Environment の保護）**: Secrets を使わない preflight ジョブで、Required reviewers（承認者 1 人以上）と、デプロイ元ブランチが main のみであることを確認。Environment が無い・API のエラー・通信エラー・想定外の応答でも停止。マイグレーション直前にも再確認
- **R1**: DB のホスト名・エンドポイント ID を Actions のログで伏せ字にする（`scripts/mask-database-host.ts`）
- **R2**: `inputs.target` を環境変数 `TARGET` で渡す
- **R3**: checkout は `persist-credentials: false`。`actions/checkout`・`actions/setup-node` をコミット SHA（v4.4.0）で固定
- **R4**: Vercel 上（`VERCEL=1`）で `VERCEL_ENV` が想定外なら preview として扱う。環境を判定できない本番ビルドがリモートの DB に接続するのを拒否
- **R5**: リモートの DB に対する `prisma migrate dev` / `migrate reset` / `db push` を拒否
- **R6・R7**: deployment.md に Preview の DB の共有・マイグレーションの取り消し・復旧手順、本番の `*.vercel.app` の URL ではログインできないこと、Vercel の Node.js 24.x 設定を追記

#### テスト結果

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 187 件成功（+44。M1・M2 の正常系と異常系、R4、R5、ログの伏せ字） |
| 統合テスト | 89 件成功 |
| E2E テスト | 25 件成功 |
| カバレッジ（単体 + 統合） | 行 87.7%、分岐 91.5% |

手動での確認（外部には接続していない）:

- `scripts/release-guard.ts` をローカルの疑似 GitHub API に対して実行: 正常系は成功。Environment なし（404）・承認者なし・ブランチ制限なし・API のエラー（500 / 502）・通信エラー・main が進んでいる・`GITHUB_SHA` なし・不明なコマンドはすべて終了コード 1
- `migrate.yml` を構文解析し、入力の全組み合わせ（target × ブランチ × deploy）と途中のステップの失敗で、実行されるステップを検査（production を main 以外から実行すると preflight で停止、検査の失敗後にマイグレーション・Deploy Hook が実行されない、Deploy Hook の直前に main を再確認、Action の SHA 固定、`run` に式を直接埋め込まない、など）
- Prisma CLI（ダミーの URL）: `generate` は接続先なしで成功。`DIRECT_URL` なし・Pooled、リモートへの `migrate dev` / `migrate reset` / `db push`、リモートへのシードはすべて停止
- `next start`: Vercel の環境変数なし＋リモートの DB、`VERCEL=1`＋想定外の `VERCEL_ENV` はいずれも HTTP 500 で停止（ログに接続文字列なし）。ローカルの DB では通常どおり起動

#### 残課題（利用者の作業が必要なもの）

| # | 内容 |
|---|---|
| 1 | Neon・Vercel・Resend・GitHub の設定（[deployment.md の 9 章のチェックリスト](./deployment.md#9-公開前のチェックリスト)） |
| 2 | Deploy Hook で、`vercel.json` で自動デプロイを止めた main の本番デプロイが作成されることの確認（初回） |
| 3 | `GITHUB_TOKEN`（`actions: read`）で Environment の保護ルールを読み取れることの確認（読み取れない場合は安全側で停止する） |
| 4 | 本番での確認: 再設定メールのリンク、429（IP アドレスの取得）、ヘッダー、実機（iOS Safari 等）のタッチ操作 |
| 5 | デモアカウントの方式、アーキテクチャ図・Server Actions 一覧（Phase 5 の残り） |

### 2026-10-31: PostgreSQL 18 への統一

既存の Neon の本番プロジェクト（`nameless-flower-97327417`、シンガポール）が PostgreSQL 18 だったため、ローカル（Docker）と CI を 17 から 18 に変更した（Neon には接続・変更していない）。

- `docker-compose.yml`: `postgres:18-alpine`。18 の公式イメージはデータの場所が変わり（`/var/lib/postgresql/18/docker`）、17 のデータは使えないため、新しいボリューム `pgdata18`（マウント先 `/var/lib/postgresql`）に変更。**17 のボリューム `project-management-app_pgdata` は削除せずに残している**。17 の開発用 DB は `pg_dump` で取り出して 18 に復元した（件数・マイグレーション履歴・トリガーが一致することを確認）
- `.github/workflows/ci.yml`: 統合テスト・E2E のサービスコンテナを `postgres:18-alpine` に変更
- 文書: deployment.md（PostgreSQL のバージョン、ローカルのボリューム）、design.md、README

テスト結果（PostgreSQL 18.6）: lint・型チェック・ビルド成功、単体 187 件・統合 89 件・E2E 25 件成功。空のテスト用 DB に 2 つのマイグレーションを最初から適用できることも確認した。なお、Phase 1 の報告にある「PostgreSQL 17」は当時の記録として残している。

### 2026-10-31: E2E テストの不定期な失敗の修正

PostgreSQL 18 への変更後の CI で、E2E「キーボードだけでカードを別の列へ移動できる」が失敗した（その前の CI でも同じエラーで 1 回失敗し、再試行で成功していた。PostgreSQL 18 とは無関係）。

- **原因 1（アプリの不具合）**: dnd-kit は onDragOver / onDragEnd を呼んだ直後、同じ処理の中で読み上げを呼ぶ。読み上げが state（次の描画まで移動前のまま）から位置を求めていたため、列をまたいだ直後の読み上げが移動前の位置（「未着手の1番目に移動中」）になっていた。正しい読み上げは、その後に移動先が再度変わったときにだけ出ていたため、タイミングによって失敗していた。スクリーンリーダーの利用者にも誤った位置が読み上げられうる。ハンドラー内で計算した最新の並び（ref）から読み上げるよう修正（`kanban-board.tsx`）
- **原因 2（テストの不具合）**: 移動の保存後に再読み込みする前に `waitForLoadState("networkidle")` で待っていたが、読み込み済みのページではすぐに返るため、保存（Server Action）の完了前に再読み込みして保存が中断されることがあった（CPU に負荷をかけた環境で再現）。保存の応答を待つ `waitForServerAction` を追加し、ボード・スマートフォンのテストで使用
- 確認: 修正前は CPU に負荷をかけた状態で 20 回中 2 回失敗。修正後は負荷をかけた状態で ボード・スマートフォンのテスト各 40 回、負荷なしでボードのテスト 20 回、すべて成功（負荷をかけた最後の回にスマートフォンの別のテストが画面遷移の待ち時間切れで 1 回ずつ失敗。修正箇所とは無関係で CI でも未発生）。単体 187 件・統合 89 件・E2E 全体 2 回分（50 件）成功

### 2026-10-31: 公開後レビューへの対応（B-1 関数のリージョン、B-2 本番ドメインの表記）

本番公開後のレビューで見つかった 2 件に対応した（本番へのデプロイ・DB の操作は未実施）。

- **B-1（関数と DB のリージョン）**: 本番の応答ヘッダー（`X-Vercel-Id: …::iad1::…`）から、関数が米国東部で動いていて、DB（Neon、シンガポール）とクエリ 1 回ごとに太平洋を往復していることが分かった。Prisma の対話型トランザクションは既定で 5 秒で打ち切られるため、タスクの多い列での並べ替えや、担当タスクの多いメンバーの削除が失敗するおそれがあった
  - `vercel.json` に `"regions": ["sin1"]` を追加（次の本番デプロイから有効）
  - 並び順の振り直し（`applyPositions`）を、タスク 1 件ごとの UPDATE から 1 回の UPDATE（`UPDATE … FROM (VALUES …)`）に変更。生 SQL では Prisma の `@updatedAt` が効かないため `updatedAt` も UTC で更新し、更新件数が想定と違えば中断する
  - メンバー削除時の担当解除と履歴の記録を、それぞれ 1 回のクエリ（`updateManyAndReturn`・`createMany`）に変更
  - テスト: トランザクション内のクエリ数を数える補助（`tests/helpers/query-count.ts`）を追加し、移動・編集・削除・メンバー削除のクエリ数がタスク数（5 件と 60 件、2 件と 40 件）によらず一定であることを確認。修正前のコードではこのテストが失敗することも確認した
- **B-2（本番ドメインの表記）**: 実際の本番ドメインは `projectflow.art-full-stack.com` だが、README・deployment.md・design.md・コメント・テストに `projects.art-full-stack.com`（DNS に存在しない）と書かれていたため統一した

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 187 件成功 |
| 統合テスト | 92 件成功（+3） |
| E2E テスト | 25 件成功 |

本番への反映（2026-10-31）: main（`acddcec`）で Database migration ワークフローを実行して本番デプロイ。本番の応答ヘッダー `X-Vercel-Id` が `kix1::sin1::…` になったことを確認した（6 回とも `sin1`）。

### 2026-11-01: 公開後レビューへの対応（P1: B-3 入力検証、B-5 バックアップ、DB のロール）

- **B-3（Better Auth の API のサーバー側の入力検証）**: 登録とプロフィール更新は、ブラウザから Better Auth の API（`/sign-up/email`・`/update-user`）を直接呼ぶ。Better Auth は名前の長さを制限せず（`/update-user` は型も検証しない）、画像の URL も受け付けるため、API を直接呼ぶと 50 文字を超える名前や文字列以外の値を保存できた
  - `src/lib/auth/user-input.ts`: 画面のフォームと同じ規則（`requiredText(USER_NAME_MAX)`）で名前を検証し、前後の空白を除く。`image` と、`/update-user` での名前以外の項目は拒否する
  - `src/lib/auth/auth.ts`: Better Auth の `hooks.before` から呼び、不正なら 400（`INVALID_USER_INPUT`）
  - なお `emailVerified` などの変更は、Better Auth 自身が以前から拒否している（`input: false`）
  - テスト: 単体 15 件、統合 3 件（実際の HTTP ハンドラーを経由。フックを外すと失敗することを確認）
- **B-5（バックアップ）**: deployment.md を Free プランの制約に合わせて更新
  - 2.5 を新設: 履歴保持 **6 時間**（API で `history_retention_seconds` = 21600 を確認）、自動停止 5 分（変更不可）
  - 8 章: 論理バックアップを月 1 回から**毎日**に変更し、目標復旧時点を「6 時間以内は直前、それ以外は最大 1 日分のデータを失う」に修正。取得手順（接続文字列を表示・保存しない `pg_dump` → `pg_restore --list` での確認 → gpg で暗号化）を追加し、ローカルの DB で手順のコマンドが動くことを確認。論理バックアップからの復元手順も追加
  - 自動化は未導入（公開リポジトリの Artifact は誰でもダウンロードできるため使わない、などの注意を記載）
- **DB のロール（Neon の API で GET のみ）**: 本番ブランチに `production_app`、Preview ブランチに `preview_app` があり、どちらも `public` スキーマの `USAGE` と、アプリのテーブル 10 個への `SELECT, INSERT, UPDATE, DELETE` だけを持つ（`_prisma_migrations` への権限なし）。今後のテーブルにも既定の権限で同じ権限が付く。deployment.md に、ロールの対応（アプリは `*_app`、マイグレーションは `neondb_owner`）とシーケンスを追加する場合の注意を追記し、`preview` Environment の `DIRECT_URL` を `preview_app` と書いていた誤りを修正した

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 202 件成功（+15） |
| 統合テスト | 95 件成功（+3） |
| E2E テスト | 25 件成功 |

### 2026-11-01: E2E の不定期な失敗への対応（キーボード操作のタイミング、プロジェクト作成の判定）

PR #2 の CI で、E2E「キーボードだけでカードを別の列へ移動できる」が再試行を含めて 2 回失敗した（Space で持ち上げた後に ArrowRight を押しても、読み上げが「未着手の1番目に移動中」のまま変わらない）。調査の過程で、テストの準備段階の別の不定期な失敗も見つかった。アプリのコードは変更していない。

- **C（キーボード操作のタイミング。原因を特定して修正）**: dnd-kit の KeyboardSensor は、Space で持ち上げると読み上げ（`onDragStart`）を同期的に出した後、矢印キーを受け付ける keydown リスナーを `setTimeout` で登録する（`@dnd-kit/core` の `KeyboardSensor.attach()`）。テストは読み上げを合図に ArrowRight を送っていたため、タイマーの実行が遅れるとリスナーの登録より先にキーが届き、無視されていた
  - 根拠: 時刻付きの計測で、読み上げからリスナー登録までが 2〜18ms、その後 ArrowRight が届くまで約 14ms しか余裕がないことを確認。Space から ArrowRight までのタイマーを登録順を保ったまま遅らせると 10 回中 10 回、CI と同じ症状で失敗し、下記の修正を入れると 10 回中 10 回成功した（自然な状態のローカル実行では再現しなかった）
  - 修正: `e2e/helpers.ts` に `waitForQueuedTimers(page)`（遅延 0 のタイマーの実行を待つ）を追加し、読み上げの確認後、ArrowRight の前に呼ぶ。HTML の仕様で同じ遅延のタイマーは登録順に実行されるため、それより前に予約されたリスナー登録が済んだことを確認できる（一定時間の待機ではない）。ArrowRight を繰り返し送る方法は、2 列動くおそれがあるため採らなかった
  - 制約: dnd-kit がリスナーの登録方法を変えた場合はこの待ち方では足りなくなる（テストが失敗として現れる）
- **A（プロジェクト作成の完了判定。修正）**: `createProject` が作成後の URL を `/\/projects\/[^/]+$/` で確認していたが、作成画面の `/projects/new` にも一致するため、保存の完了前に次へ進み、見出しの確認（5 秒）で失敗することがあった。`waitForURL` で pathname が `/projects/<id>`（`new` 以外）になるまで待ってから見出しを確認するよう修正
- **B（ブラウザ内でリクエストが送られずに止まる。原因は未特定・調査中）**: テストの準備段階（タスク・プロジェクトの作成）で、Server Action が応答しないまま失敗することがある。ローカルで計測付きで 760 回実行し、2 回再現した。**原因は特定できていないため、推測による修正はしていない**
  - 確認できた事実: 止まった POST はサーバー（Next.js）に届いていなかった。同時に送られた先読みの GET の一部は、テスト終了時にページを閉じるまで（約 10 秒）サーバーに届かなかった。その間もサーバーは他のリクエストを数 ms で処理しており、DB（`pg_stat_activity` を読み取りで監視）に遅いクエリ・長いトランザクション・ロック待ちはなかった
  - 観察: 停止中、ブラウザからサーバーへの TCP 接続は 6 本（Chrome のホストあたりの上限と同じ）で、サーバー側ではすべて処理を終えていたが、ブラウザはそれらにリクエストを送らなかった。ブラウザ内で何を待っていたかは、netlog を記録した 520 回で再現しなかったため確認できていない
  - 観察されたすべての失敗はビルド直後に開始した実行で起きたが、ビルド直後でも成功した実行の方が多く、関係は確認できていない。CI（Linux）で起きるかは未確認
  - 今後の調査案: CI で netlog を記録して失敗時に保存する、接続先を `localhost` から `127.0.0.1` にして発生率を比べる（いずれも仮説の確認のため）

| 種類 | 結果 |
|---|---|
| キーボード操作の E2E の繰り返し | 40 回すべて成功（通常の設定）。計測付きの実行 760 回でも、キーボード操作の段階での失敗は 0 件 |
| E2E テスト（desktop・mobile） | 25 件成功 |
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 202 件成功 |
| 統合テスト | 95 件成功 |

### 2026-11-01: 資料の作成（アーキテクチャ図、Server Actions 一覧）

Phase 5 の残りの資料を作成した。コードは変更していない。

- **[architecture.md](./architecture.md)**: 本番のシステム構成（Vercel sin1・Neon・Resend・GitHub Actions）、環境ごとの違い、アプリ内部のレイヤー、主な処理の流れ（画面の表示、Server Action による更新、カンバンのドラッグ＆ドロップ、パスワード再設定）、リリースの流れを Mermaid で図示
- **[server-actions.md](./server-actions.md)**: API 設計資料。共通の処理順序・戻り値（`ActionResult`）とエラーの対応・権限表・入力の型、Server Actions 12 個の権限・入力・戻り値・エラー・再検証するパス、Better Auth の API（レート制限・入力検証）、読み取りの経路
- README・design.md から両資料へリンクした
- 記載内容は actions / schemas / service / auth の実装と照合した

### 2026-11-01: デモアカウント（訪問者ごとの一時アカウント）

決定事項 P を「訪問者ごとの一時アカウント」に決定し、実装した（[design.md](./design.md) 7 章）。

#### 実装内容

- **デモの開始**: ログイン画面に「登録せずにデモを試す」を追加。Better Auth 公式の `anonymous` プラグイン（`POST /api/auth/sign-in/anonymous`）で、パスワードを持たない一時的なユーザー（名前「ゲスト」、メールアドレスは `@demo.projectflow.invalid`）を作成してログインする
- **サンプルデータ**（`src/features/demo/service.ts`）: ユーザーの作成直後（Better Auth の `hooks.after`）に、架空のメンバー 3 人（うち 1 人はメンバー追加を試す用）、プロジェクト 2 件、タスク 9 件（期限切れ・期限間近を含む。日付は今日を基準）、コメント、更新履歴を 1 トランザクションで作成。失敗した場合はユーザーごと削除してエラーにする
- **乱用対策**: デモの開始は IP ごとに 1 時間 3 回（既存のレート制限に追加）。デモのユーザーは同時に 200 人まで。Vercel 上で `CRON_SECRET` が無い環境ではデモを開始させない（削除されずに溜まるのを防ぐ。アプリ自体は止めない）
- **デモのユーザーの制限**: パスワードの変更・再設定はできない（設定画面ではパスワード変更の代わりに説明を表示。再設定メールは `.invalid` の宛先に送らない）。メンバー追加は、デモのユーザーは自分のデモの架空のメンバーだけ、通常のユーザーは通常のユーザーだけ（それ以外は「見つからない」と同じ応答。`src/domain/demo.ts` の `canAddAsMember`）
- **削除**: `GET /api/cron/demo-cleanup`（`Authorization: Bearer <CRON_SECRET>` を一定時間で比較）を Vercel Cron が 1 日 1 回（03:00 JST）呼び、作成から 24 時間を過ぎたデモのユーザーを、Owner のプロジェクトを先に削除してから削除する（架空のメンバー・セッションは CASCADE。1 回 100 人まで）。プラグイン自身の削除機能は、Owner のプロジェクトが残ったまま削除しようとして DB のトリガーで失敗するため無効にした
- **画面**: デモのユーザーには、アプリの上部に「データは 1〜2 日後に自動で削除されます」のバナーを表示
- **DB**: マイグレーション `20261101003639_demo_accounts`（`users.isAnonymous`・`users.demoOwnerId` とインデックス）。新しいテーブル・シーケンスは無いため、`production_app` / `preview_app` の権限の追加は不要
- **文書**: deployment.md 5.3（`CRON_SECRET`）・5.4（定期処理）・9 章、design.md、er-diagram.md、server-actions.md、architecture.md、README

#### テスト結果

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| 単体テスト | 212 件成功（+10。メンバー追加の組み合わせ、期限、Cron の認証） |
| 統合テスト | 110 件成功（+15。HTTP ハンドラー経由のデモ開始とサンプルデータの整合性、再度の開始の拒否、上限、`CRON_SECRET` が無い環境、再設定メールを送らない、パスワード変更の拒否、メンバー追加の制限、期限切れの削除と残すもの、limit、Cron の API の 401、デモ開始のレート制限） |
| E2E テスト | 28 件成功（+3。デモの開始からカンバン・設定画面まで、デモのバナーのアクセシビリティ（ライト・ダーク）） |

#### セキュリティ確認

- デモの開始は未ログインで DB に行を作る操作のため、IP ごとのレート制限と全体の上限で量を抑えた。多数の IP から上限まで使われるとデモが最長 2 日ほど使えなくなるが、通常のユーザーには影響しない
- デモのユーザーから実在のユーザーの登録の有無を調べたり、実在のユーザーをデモのプロジェクトに巻き込んだりできない。通常のユーザーも他人のデモのユーザーを追加できない
- Cron の API は `CRON_SECRET` が未設定・短い場合は常に 401。ログには削除した件数だけを出す

#### 残課題（利用者の作業が必要なもの）

| # | 内容 |
|---|---|
| 1 | Vercel の Production に `CRON_SECRET` を登録する（未登録でもアプリは動くが、デモは開始できない） |
| 2 | `target: preview` → `target: production` でマイグレーション（`demo_accounts`）と本番デプロイを実行し、本番でデモの開始と、Vercel の「Cron Jobs」に `/api/cron/demo-cleanup` が表示されることを確認する |

### 2026-11-01: 本番での確認と、見つかった設定ミスの再発防止

`demo_accounts` のマイグレーションと本番デプロイの後、本番で確認作業を行い、設定ミスが 2 件見つかった（どちらも利用者が設定を修正して解消済み）。

#### 見つかった問題

| # | 症状 | 原因 | 対応 |
|---|---|---|---|
| 1 | 本番で新規登録すると「予期しないエラー」。ログインも同様に失敗していた | Vercel の Production の `BETTER_AUTH_URL` が本番ドメインと違う値だった。Better Auth は `BETTER_AUTH_URL` のオリジンだけを信頼するため、本番ドメインからの登録・ログインが `403 INVALID_ORIGIN` で拒否されていた。起動時の検査は「https のオリジンか」しか見ていなかった | 値を修正して再デプロイ。本番ドメインからは 401（通常の認証エラー）、他のサイトからは 403 になることを確認 |
| 2 | パスワード再設定メールが届かない（画面上は成功） | 送信元ドメイン `mail.art-full-stack.com` が Resend で認証されていなかった（DKIM・SPF の DNS レコードが存在しない）。送信の失敗は利用者に知らせない設計のため、画面からは分からなかった | Resend でドメインを認証。再設定メールの受信、リンクが本番ドメインであること、パスワードの変更とログインを確認 |

調査中、Origin の検証の挙動を確かめるために本番の `/sign-in/anonymous` へ要求を送り、**本番にデモのユーザーを 1 件作成してしまった**（作業者のミス）。Cron で作成の 24〜48 時間後に削除される。それ以外の調査の要求は、存在しないメールアドレスでのログインなど、本番にデータを作らないものだけを使った。

#### 再発防止策

- **ビルド時・起動時の検査**（`src/lib/env.ts`）: Production で `BETTER_AUTH_URL` のオリジンが `https://` + `VERCEL_PROJECT_PRODUCTION_URL`（Vercel が設定する本番ドメイン）と一致しなければエラー。`VERCEL_PROJECT_PRODUCTION_URL` が無い場合もエラー
- **ビルド時にも検査する**（`next.config.ts`）: これまでは起動時（`instrumentation.ts`）だけで、誤った設定のデプロイが本番に切り替わってからサイト全体が止まる作りだった。Vercel 上のビルドでも同じ検査を行い、失敗したらデプロイを本番に切り替えない（ローカル・CI のビルドは対象外）
- **エラー表示**: `INVALID_ORIGIN` / `MISSING_OR_NULL_ORIGIN` は、共通の「予期しないエラー」やログイン画面の「メールアドレスまたはパスワードが違う」ではなく、URL の問題であることが分かるメッセージにした（デモの開始ボタンも同様）
- **資料**: deployment.md の 3.2 に今回の症状・検査・注意点（`VERCEL_PROJECT_PRODUCTION_URL` は最も短い独自ドメインになる）、4 章に Resend の Verified の確認と DNS の確認コマンド、9 章のチェックリストに `BETTER_AUTH_URL` の一致・ドメインの Verified・**再設定メールの実際の受信**・新規登録を追加

#### 本番での確認結果（利用者が実施）

| 項目 | 結果 |
|---|---|
| 新規登録・ログイン | 成功（`BETTER_AUTH_URL` の修正後） |
| 再設定メール | 受信でき、リンクから新しいパスワードを設定してログインできた（Resend の認証後） |
| 429 | 間違ったパスワードで 11 回目に制限のメッセージ。1 分後に正しいパスワードでログインできた |
| ヘッダー | CSP（nonce・`strict-dynamic`・`frame-ancestors 'none'`）、`strict-transport-security: max-age=63072000`、`x-vercel-id` が `sin1` |
| 論理バックアップ | 8.2 の手順で 1 回目を取得し、復号できることを確認 |

#### テスト結果（2026-11-01、ローカル）

| 種類 | 結果 |
|---|---|
| lint / 型チェック / ビルド | 成功 |
| ビルド時の検査 | Production を模した環境変数で `BETTER_AUTH_URL` を `*.vercel.app` にすると `next build` が失敗することを確認 |
| 単体テスト | 219 件成功（+7。本番ドメインと違う `BETTER_AUTH_URL`、`VERCEL_PROJECT_PRODUCTION_URL` の不足、Origin のエラー表示） |
| 統合テスト | 110 件成功（変更なし） |
| E2E テスト | 28 件成功（変更なし。`next.config.ts` の変更後のビルドで実行） |

#### 残課題

| # | 内容 |
|---|---|
| 1 | ~~本番の `VERCEL_PROJECT_PRODUCTION_URL` が `projectflow.art-full-stack.com` であることの確認~~ → 確認済み（PR #4 の本番デプロイでビルドが成功し、本番が切り替わった。新規登録・ログインも利用者が確認。本番ドメインからの認証 API は 401、他のサイトからは 403） |
| 2 | 実機（iOS Safari 等）でのタッチ操作の確認 |
| 3 | Deploy Hook と `GITHUB_TOKEN` の確認結果の記録（Actions・Vercel の画面で確認） |
| 4 | 論理バックアップを毎日続ける（自動化は未導入） |

---

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
