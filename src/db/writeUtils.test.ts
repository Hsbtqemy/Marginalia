import test from "node:test";
import assert from "node:assert/strict";
import type Database from "@tauri-apps/plugin-sql";
import { runInTransaction, runSerializedWrite } from "./writeUtils";

class FakeDatabase {
  readonly statements: string[] = [];

  async execute(sql: string): Promise<void> {
    this.statements.push(sql);
  }
}

function asDatabase(fakeDb: object): Database {
  return fakeDb as Database;
}

test("runInTransaction commits when work succeeds", async () => {
  const fakeDb = new FakeDatabase();

  const result = await runInTransaction(asDatabase(fakeDb), async () => {
    fakeDb.statements.push("WORK");
    return "done";
  });

  assert.equal(result, "done");
  assert.deepEqual(fakeDb.statements, ["BEGIN", "WORK", "COMMIT"]);
});

test("runInTransaction rolls back when work throws", async () => {
  const fakeDb = new FakeDatabase();
  const failure = new Error("boom");

  await assert.rejects(
    () =>
      runInTransaction(asDatabase(fakeDb), async () => {
        fakeDb.statements.push("WORK");
        throw failure;
      }),
    failure,
  );

  assert.deepEqual(fakeDb.statements, ["BEGIN", "WORK", "ROLLBACK"]);
});

test("runSerializedWrite executes writes sequentially for the same database", async () => {
  const database = asDatabase({});
  const events: string[] = [];
  let releaseFirst: (() => void) | null = null;
  let resolveFirstStarted: (() => void) | null = null;
  const firstStarted = new Promise<void>((resolve) => {
    resolveFirstStarted = resolve;
  });

  const first = runSerializedWrite(database, async () => {
    events.push("first:start");
    resolveFirstStarted?.();
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    events.push("first:end");
    return "first";
  });

  const second = runSerializedWrite(database, async () => {
    events.push("second:start");
    events.push("second:end");
    return "second";
  });

  await firstStarted;
  assert.deepEqual(events, ["first:start"]);
  releaseFirst?.();

  const results = await Promise.all([first, second]);
  assert.deepEqual(results, ["first", "second"]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
});

test("runSerializedWrite continues after a failed write", async () => {
  const database = asDatabase({});
  const events: string[] = [];
  const failure = new Error("first failed");

  await assert.rejects(
    () =>
      runSerializedWrite(database, async () => {
        events.push("first");
        throw failure;
      }),
    failure,
  );

  const second = await runSerializedWrite(database, async () => {
    events.push("second");
    return "ok";
  });

  assert.equal(second, "ok");
  assert.deepEqual(events, ["first", "second"]);
});
