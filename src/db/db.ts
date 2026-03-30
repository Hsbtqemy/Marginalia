import Database from "@tauri-apps/plugin-sql";
import migration001 from "./migrations/001_initial.sql?raw";
import { splitStatements } from "./sqlStatements";

export const APP_DB_PATH = "sqlite:app.db";

interface MigrationDef {
  version: number;
  sql: string;
}

const MIGRATIONS: MigrationDef[] = [{ version: 1, sql: migration001 }];
const WRITE_QUEUES = new WeakMap<Database, Promise<void>>();

async function runStatements(db: Database, sql: string): Promise<void> {
  const statements = splitStatements(sql);
  for (const statement of statements) {
    await db.execute(statement);
  }
}

async function ensureMigrationTable(db: Database): Promise<void> {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
}

async function appliedMigrationVersions(db: Database): Promise<Set<number>> {
  const rows = await db.select<Array<{ version: number }>>("SELECT version FROM schema_migrations ORDER BY version ASC");
  return new Set(rows.map((row) => row.version));
}

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

export async function openAppDatabase(): Promise<Database> {
  const db = await Database.load(APP_DB_PATH);
  await db.execute("PRAGMA foreign_keys = ON");
  await ensureMigrationTable(db);
  const applied = await appliedMigrationVersions(db);

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    await runInTransaction(db, async () => {
      await runStatements(db, migration.sql);
      await db.execute("INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)", [
        migration.version,
        Date.now(),
      ]);
    });
  }

  return db;
}
