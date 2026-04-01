import test from "node:test";
import assert from "node:assert/strict";
import { createLinkedMarginaliaScheduler } from "./linkedMarginalia";

class FakeTimers {
  private nextTimeoutId = 1;

  private pending = new Map<number, () => void>();

  setTimeout = (callback: () => void): number => {
    const timeoutId = this.nextTimeoutId++;
    this.pending.set(timeoutId, callback);
    return timeoutId;
  };

  clearTimeout = (timeoutId: number): void => {
    this.pending.delete(timeoutId);
  };

  flushAll(): void {
    while (this.pending.size > 0) {
      const [timeoutId, callback] = [...this.pending.entries()].sort(([left], [right]) => left - right)[0];
      this.pending.delete(timeoutId);
      callback();
    }
  }
}

test("linked marginalia scheduler keeps only the latest pending request", () => {
  const timers = new FakeTimers();
  const actions: string[] = [];
  const scheduler = createLinkedMarginaliaScheduler({
    timers,
    getCurrentDocumentId: () => "doc-1",
    resolveManuscriptBlockForLink: (manuscriptBlockId) => manuscriptBlockId,
    focusManuscriptBlockById: (manuscriptBlockId) => actions.push(`focus:${manuscriptBlockId}`),
    insertLinkedMarginBlock: (manuscriptBlockId) => actions.push(`insert:${manuscriptBlockId}`),
    focusMarginEditor: () => actions.push("focus-margin"),
    reportError: () => {
      throw new Error("Unexpected error report");
    },
  });

  scheduler.schedule("doc-1", "first");
  scheduler.schedule("doc-1", "second");
  assert.equal(scheduler.hasPending(), true);

  timers.flushAll();

  assert.equal(scheduler.hasPending(), false);
  assert.deepEqual(actions, ["focus:second", "insert:second", "focus-margin"]);
});

test("linked marginalia scheduler drops work when the active document changes before flush", () => {
  const timers = new FakeTimers();
  const actions: string[] = [];
  let currentDocumentId = "doc-1";

  const scheduler = createLinkedMarginaliaScheduler({
    timers,
    getCurrentDocumentId: () => currentDocumentId,
    resolveManuscriptBlockForLink: (manuscriptBlockId) => manuscriptBlockId ?? "ensured-block",
    focusManuscriptBlockById: (manuscriptBlockId) => actions.push(`focus:${manuscriptBlockId}`),
    insertLinkedMarginBlock: (manuscriptBlockId) => actions.push(`insert:${manuscriptBlockId}`),
    focusMarginEditor: () => actions.push("focus-margin"),
    reportError: () => {
      throw new Error("Unexpected error report");
    },
  });

  scheduler.schedule("doc-1", null);
  currentDocumentId = "doc-2";

  timers.flushAll();

  assert.deepEqual(actions, []);
});

test("linked marginalia scheduler reports editor failures without throwing", () => {
  const timers = new FakeTimers();
  const failure = new Error("insert failed");
  const reportCalls: Array<{ message: string; error: unknown }> = [];

  const scheduler = createLinkedMarginaliaScheduler({
    timers,
    getCurrentDocumentId: () => "doc-1",
    resolveManuscriptBlockForLink: (manuscriptBlockId) => manuscriptBlockId ?? "ensured-block",
    focusManuscriptBlockById: () => undefined,
    insertLinkedMarginBlock: () => {
      throw failure;
    },
    focusMarginEditor: () => undefined,
    reportError: (message, error) => {
      reportCalls.push({ message, error });
    },
  });

  scheduler.schedule("doc-1", "linked-block");
  timers.flushAll();

  assert.deepEqual(reportCalls, [{ message: "A linked note could not be created.", error: failure }]);
});
