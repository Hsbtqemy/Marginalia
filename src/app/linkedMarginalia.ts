interface TimeoutApi {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timeoutId: number): void;
}

interface LinkedMarginaliaSchedulerDeps {
  timers: TimeoutApi;
  getCurrentDocumentId: () => string | null;
  resolveManuscriptBlockForLink: (manuscriptBlockId: string | null) => string | null;
  focusManuscriptBlockById: (manuscriptBlockId: string) => void;
  insertLinkedMarginBlock: (manuscriptBlockId: string) => void;
  focusMarginEditor: () => void;
  reportError: (message: string, error: unknown) => void;
}

export interface LinkedMarginaliaScheduler {
  clearPending: () => void;
  hasPending: () => boolean;
  schedule: (documentId: string, manuscriptBlockId: string | null) => void;
}

export function createLinkedMarginaliaScheduler(
  deps: LinkedMarginaliaSchedulerDeps,
): LinkedMarginaliaScheduler {
  let pendingTimeoutId: number | null = null;

  const clearPending = () => {
    if (pendingTimeoutId === null) {
      return;
    }

    deps.timers.clearTimeout(pendingTimeoutId);
    pendingTimeoutId = null;
  };

  const run = (documentId: string, manuscriptBlockId: string | null) => {
    if (deps.getCurrentDocumentId() !== documentId) {
      return;
    }

    const resolvedBlockId = deps.resolveManuscriptBlockForLink(manuscriptBlockId);
    if (!resolvedBlockId) {
      return;
    }

    try {
      deps.focusManuscriptBlockById(resolvedBlockId);
      deps.insertLinkedMarginBlock(resolvedBlockId);
      deps.focusMarginEditor();
    } catch (error) {
      deps.reportError("A linked note could not be created.", error);
    }
  };

  return {
    clearPending,
    hasPending: () => pendingTimeoutId !== null,
    schedule: (documentId: string, manuscriptBlockId: string | null) => {
      clearPending();
      pendingTimeoutId = deps.timers.setTimeout(() => {
        pendingTimeoutId = null;
        run(documentId, manuscriptBlockId);
      }, 0);
    },
  };
}
