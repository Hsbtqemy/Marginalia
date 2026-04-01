import type Database from "@tauri-apps/plugin-sql";

const WRITE_QUEUES = new WeakMap<Database, Promise<void>>();

export async function runInTransaction<T>(db: Database, work: () => Promise<T>): Promise<T> {
  await db.execute("BEGIN");
  try {
    const result = await work();
    await db.execute("COMMIT");
    return result;
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function runSerializedWrite<T>(db: Database, work: () => Promise<T>): Promise<T> {
  const previous = WRITE_QUEUES.get(db) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(work);
  WRITE_QUEUES.set(
    db,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}
