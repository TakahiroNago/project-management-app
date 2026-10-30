export const backgroundTasks: Promise<unknown>[] = [];

/** runInBackground に渡された処理の完了を待つ */
export async function flushBackgroundTasks() {
  await Promise.all(backgroundTasks.splice(0));
}
