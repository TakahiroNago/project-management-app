/**
 * バックアップの保管先（R2）で使う名前と、削除してよいものの選択（scripts/backup/encrypt-and-upload.sh から実行）。
 *
 *   npx tsx scripts/backup/storage.ts object-key <target>
 *     → 今回のファイルのキーを出力する（例: production/projectflow-production-20261102T190012Z.dump.gpg）
 *
 *   aws s3api list-objects-v2 ... --output json | npx tsx scripts/backup/storage.ts select-expired <target>
 *     → 削除してよいキーを 1 行に 1 つ出力する（最新のものは出力しない。src/lib/backup/retention.ts）
 */
import { backupObjectKey, selectExpiredBackups, type StoredObject } from "../../src/lib/backup/retention";
import { isBackupTarget } from "../../src/lib/backup/target";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** list-objects-v2 の出力（{ "Contents": [{ "Key", "LastModified" }] }）を読む。オブジェクトが無い場合は空 */
function parseListing(text: string): StoredObject[] {
  if (text.trim() === "") return [];
  const body: unknown = JSON.parse(text);
  if (body === null) return [];
  if (typeof body !== "object") throw new Error("Unexpected listing.");
  const contents = (body as { Contents?: unknown }).Contents ?? [];
  if (!Array.isArray(contents)) throw new Error("Unexpected listing.");
  return contents.map((item) => {
    const { Key, LastModified } = (item ?? {}) as { Key?: unknown; LastModified?: unknown };
    const lastModified = new Date(String(LastModified));
    if (typeof Key !== "string" || Number.isNaN(lastModified.getTime())) throw new Error("Unexpected object in the listing.");
    return { key: Key, lastModified };
  });
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (!isBackupTarget(target)) throw new Error("Specify the target: production or preview.");
  switch (command) {
    case "object-key":
      console.info(backupObjectKey(target, new Date()));
      return;
    case "select-expired": {
      const expired = selectExpiredBackups(parseListing(await readStdin()), { target, now: new Date() });
      for (const key of expired) console.info(key);
      return;
    }
    default:
      throw new Error("Unknown command. Use one of: object-key, select-expired.");
  }
}

main().catch((e: unknown) => {
  console.error(`::error::${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
