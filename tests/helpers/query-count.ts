import { vi } from "vitest";
import { db } from "@/lib/db";

/** トランザクションクライアントへの呼び出し（モデルの操作・生 SQL）を数える Proxy */
function countingClient<T extends object>(client: T, onQuery: () => void): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string") return value;
      // $queryRaw / $executeRaw など
      if (property.startsWith("$") && typeof value === "function") {
        return (...args: unknown[]) => {
          onQuery();
          return value.apply(target, args);
        };
      }
      // tx.task / tx.activityLog などのモデル
      if (typeof value === "object" && value !== null && !property.startsWith("$") && !property.startsWith("_")) {
        return new Proxy(value, {
          get(model, method, modelReceiver) {
            const fn = Reflect.get(model, method, modelReceiver);
            if (typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              onQuery();
              return fn.apply(model, args);
            };
          },
        });
      }
      return value;
    },
  });
}

/**
 * fn の中で実行された db.$transaction（コールバック形式）内のクエリ数を数える。
 * DB との往復の回数がデータ量に比例して増えていないか（本番では 1 往復ごとに遅延がかかる）を検査するため。
 */
export async function countTransactionQueries(fn: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const original = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
  const spy = vi.spyOn(db, "$transaction").mockImplementation(((callback: unknown, options?: unknown) => {
    if (typeof callback !== "function") return original(callback, options);
    return original((tx: object) => callback(countingClient(tx, () => count++)), options);
  }) as typeof db.$transaction);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return count;
}
