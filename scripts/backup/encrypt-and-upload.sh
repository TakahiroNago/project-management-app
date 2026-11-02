#!/usr/bin/env bash
# 平文のダンプを公開鍵で暗号化して R2（S3 互換のストレージ）にアップロードし、保管期間を過ぎたものを削除する。
# .github/workflows/backup.yml から、scripts/backup/dump-and-verify.ts の後に実行する。
#
# 環境変数:
#   BACKUP_TARGET           production | preview（保管先のプレフィックス）
#   BACKUP_FILE             平文のダンプ（暗号化した後に削除する）
#   BACKUP_PUBLIC_KEY_FILE  暗号化に使う公開鍵（ASCII 形式。復号用の秘密鍵は GitHub に置かない）
#   S3_ENDPOINT_URL         例: https://<アカウント ID>.r2.cloudflarestorage.com
#   S3_BUCKET               保管先のバケット
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  バケットの API トークン（そのバケットだけに限定したもの）
#
# ログに出すのはキー・サイズ・SHA-256 だけ（データ・接続情報は出さない）。
set -euo pipefail

: "${BACKUP_TARGET:?}" "${BACKUP_FILE:?}" "${BACKUP_PUBLIC_KEY_FILE:?}" "${S3_ENDPOINT_URL:?}" "${S3_BUCKET:?}"
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"

# R2 はリージョンを "auto" とする。AWS CLI の新しい既定のチェックサム（CRC64 など）は送らない
export AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
export AWS_EC2_METADATA_DISABLED=true

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
storage() { npx --no-install tsx "$script_dir/storage.ts" "$@"; }
s3api() { aws s3api --endpoint-url "$S3_ENDPOINT_URL" "$@"; }

if [ ! -s "$BACKUP_FILE" ]; then
  echo "::error::The dump file does not exist or is empty."
  exit 1
fi
if [ ! -s "$BACKUP_PUBLIC_KEY_FILE" ]; then
  echo "::error::The backup public key ($BACKUP_PUBLIC_KEY_FILE) does not exist. See docs/deployment.md (8.2)."
  exit 1
fi

# --- 1. 暗号化 ---
# 実行のたびに空の鍵束を使い、ランナーの既存の鍵の影響を受けないようにする
GNUPGHOME="$(mktemp -d)"
export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT

# 公開鍵のファイルに鍵が 1 つだけあり、暗号化に使える有効な（期限切れ・失効していない）副鍵か主鍵があること
key_listing="$(gpg --batch --quiet --show-keys --with-colons "$BACKUP_PUBLIC_KEY_FILE" 2>/dev/null)"
if [ "$(grep -c '^pub:' <<<"$key_listing")" -ne 1 ]; then
  echo "::error::The backup public key file must contain exactly one key."
  exit 1
fi
# フィールド 2 = 有効性（e: 期限切れ、r: 失効）、5 = 鍵 ID、12 = 用途（e: 暗号化）
encryption_key_ids="$(awk -F: '($1 == "pub" || $1 == "sub") && $2 !~ /[erd]/ && $12 ~ /e/ { print $5 }' <<<"$key_listing")"
if [ -z "$encryption_key_ids" ]; then
  echo "::error::The backup public key has no valid encryption key (expired or revoked?)."
  exit 1
fi

encrypted="$BACKUP_FILE.gpg"
if [ -e "$encrypted" ]; then
  echo "::error::The encrypted file already exists. Refusing to overwrite it."
  exit 1
fi
# ダンプ（カスタム形式）はすでに圧縮されているため、gpg では圧縮しない
gpg --batch --no-tty --quiet --trust-model always --recipient-file "$BACKUP_PUBLIC_KEY_FILE" \
  --compress-algo none --output "$encrypted" --encrypt "$BACKUP_FILE"
rm -f "$BACKUP_FILE"

# 暗号化したファイルが、公開鍵の暗号化用の鍵で暗号化されていること（秘密鍵が無いため復号はできない）
packet_key_ids="$(gpg --batch --no-tty --list-packets "$encrypted" 2>/dev/null | awk '/^:pubkey enc packet:/ { print $NF }' || true)"
if [ -z "$packet_key_ids" ] || ! grep -qxiF -f <(tr '[:lower:]' '[:upper:]' <<<"$encryption_key_ids") <(tr '[:lower:]' '[:upper:]' <<<"$packet_key_ids"); then
  echo "::error::The encrypted file is not encrypted to the backup public key."
  exit 1
fi
if gpg --batch --no-tty --list-packets "$encrypted" 2>/dev/null | grep -q '^:literal data packet:'; then
  echo "::error::The encrypted file contains unencrypted data."
  exit 1
fi

size="$(stat -c %s "$encrypted")"
sha256="$(sha256sum "$encrypted" | cut -d' ' -f1)"
echo "Encrypted the dump ($size bytes, sha256 $sha256)."

# --- 2. アップロード ---
key="$(storage object-key "$BACKUP_TARGET")"
s3api put-object --bucket "$S3_BUCKET" --key "$key" --body "$encrypted" \
  --content-type application/pgp-encrypted --metadata "sha256=$sha256" >/dev/null

uploaded_size="$(s3api head-object --bucket "$S3_BUCKET" --key "$key" --query ContentLength --output text)"
if [ "$uploaded_size" != "$size" ]; then
  echo "::error::The uploaded object size does not match the local file."
  exit 1
fi
rm -f "$encrypted"
echo "Uploaded $key."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Backup ($BACKUP_TARGET)"
    echo ""
    echo "| Key | Size | SHA-256 |"
    echo "|---|---|---|"
    echo "| \`$key\` | $size bytes | \`$sha256\` |"
  } >>"$GITHUB_STEP_SUMMARY"
fi

# --- 3. 保管期間を過ぎたものの削除（今回のアップロードに成功した後だけ。最新のものは残す） ---
listing="$(s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix "$BACKUP_TARGET/" \
  --query 'Contents[].{Key: Key, LastModified: LastModified}' --output json)"
listing="{\"Contents\": ${listing:-null}}"
expired="$(storage select-expired "$BACKUP_TARGET" <<<"$listing")"

deleted=0
while IFS= read -r old_key; do
  [ -z "$old_key" ] && continue
  if [ "$old_key" = "$key" ]; then
    echo "::error::Refusing to delete the backup that was just uploaded."
    exit 1
  fi
  s3api delete-object --bucket "$S3_BUCKET" --key "$old_key" >/dev/null
  echo "Deleted expired backup $old_key."
  deleted=$((deleted + 1))
done <<<"$expired"
echo "Deleted $deleted expired backup(s)."
