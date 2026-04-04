export type EditorialActionPane = "left" | "center" | "right" | null;

interface EditorialUnitSelection {
  manuscriptBlockId: string;
  preferredPane: "left" | "center";
  preferredMarginBlockId: string | null;
}

export interface EditorialUnitActionDependencies {
  getActivePane: () => EditorialActionPane;
  setActivePane: (pane: "left" | "center") => void;
  getCurrentManuscriptBlockId: () => string | null;
  getCurrentLeftMarginBlockId: () => string | null;
  listManuscriptBlockIds: () => string[];
  insertManuscriptBlockBefore: (blockId?: string | null) => string | null;
  insertManuscriptBlockAfter: (blockId?: string | null) => string | null;
  duplicateManuscriptBlock: (blockId: string) => string | null;
  moveManuscriptBlockUp: (blockId: string) => string | null;
  moveManuscriptBlockDown: (blockId: string) => string | null;
  deleteManuscriptBlock: (blockId: string) => string | null;
  findMarginBlockIdsForLinkedManuscript: (manuscriptBlockId: string) => string[];
  getLinkedManuscriptBlockIdForMarginBlock: (marginBlockId: string) => string | null;
  insertLinkedMarginBlock: (
    manuscriptBlockId: string,
    options?: {
      afterMarginBlockId?: string | null;
      beforeMarginBlockId?: string | null;
      select?: boolean;
    },
  ) => string | null;
  duplicateMarginBlock: (
    marginBlockId: string,
    options?: {
      linkedManuscriptBlockId?: string | null;
      afterMarginBlockId?: string | null;
      beforeMarginBlockId?: string | null;
      select?: boolean;
    },
  ) => string | null;
  moveMarginBlockBefore: (
    marginBlockId: string,
    beforeMarginBlockId: string,
    options?: { select?: boolean },
  ) => boolean;
  moveMarginBlockAfter: (
    marginBlockId: string,
    afterMarginBlockId: string,
    options?: { select?: boolean },
  ) => boolean;
  deleteMarginBlocks: (marginBlockIds: string[]) => number;
  focusManuscriptBlockById: (manuscriptBlockId: string) => void;
  focusManuscriptEditor: () => void;
  focusMarginBlockById: (marginBlockId: string) => void;
  focusMarginEditor: () => void;
  reportError: (message: string, error: unknown) => void;
}

function resolveCurrentUnitSelection(
  dependencies: EditorialUnitActionDependencies,
): EditorialUnitSelection | null {
  const activePane = dependencies.getActivePane();
  const currentMarginBlockId = dependencies.getCurrentLeftMarginBlockId();
  const currentManuscriptBlockId = dependencies.getCurrentManuscriptBlockId();

  if (activePane === "left" && currentMarginBlockId) {
    const manuscriptBlockId =
      dependencies.getLinkedManuscriptBlockIdForMarginBlock(currentMarginBlockId);
    if (!manuscriptBlockId) {
      return null;
    }
    return {
      manuscriptBlockId,
      preferredPane: "left",
      preferredMarginBlockId: currentMarginBlockId,
    };
  }

  if (currentManuscriptBlockId) {
    return {
      manuscriptBlockId: currentManuscriptBlockId,
      preferredPane: "center",
      preferredMarginBlockId: null,
    };
  }

  if (currentMarginBlockId) {
    const manuscriptBlockId =
      dependencies.getLinkedManuscriptBlockIdForMarginBlock(currentMarginBlockId);
    if (!manuscriptBlockId) {
      return null;
    }
    return {
      manuscriptBlockId,
      preferredPane: "left",
      preferredMarginBlockId: currentMarginBlockId,
    };
  }

  return null;
}

function listLinkedMarginBlockIds(
  dependencies: EditorialUnitActionDependencies,
  manuscriptBlockId: string,
  excludedMarginBlockIds?: Set<string>,
): string[] {
  const marginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(manuscriptBlockId);
  if (!excludedMarginBlockIds || excludedMarginBlockIds.size === 0) {
    return marginBlockIds;
  }

  return marginBlockIds.filter((marginBlockId) => !excludedMarginBlockIds.has(marginBlockId));
}

function findLinkedNeighborAnchors(
  dependencies: EditorialUnitActionDependencies,
  manuscriptBlockId: string,
  excludedMarginBlockIds?: Set<string>,
): {
  afterMarginBlockId: string | null;
  beforeMarginBlockId: string | null;
} {
  const manuscriptBlockIds = dependencies.listManuscriptBlockIds();
  const currentIndex = manuscriptBlockIds.indexOf(manuscriptBlockId);

  if (currentIndex < 0) {
    return {
      afterMarginBlockId: null,
      beforeMarginBlockId: null,
    };
  }

  let afterMarginBlockId: string | null = null;
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const linkedMarginBlockIds = listLinkedMarginBlockIds(
      dependencies,
      manuscriptBlockIds[index],
      excludedMarginBlockIds,
    );
    if (linkedMarginBlockIds.length > 0) {
      afterMarginBlockId = linkedMarginBlockIds[linkedMarginBlockIds.length - 1];
      break;
    }
  }

  let beforeMarginBlockId: string | null = null;
  for (let index = currentIndex + 1; index < manuscriptBlockIds.length; index += 1) {
    const linkedMarginBlockIds = listLinkedMarginBlockIds(
      dependencies,
      manuscriptBlockIds[index],
      excludedMarginBlockIds,
    );
    if (linkedMarginBlockIds.length > 0) {
      beforeMarginBlockId = linkedMarginBlockIds[0];
      break;
    }
  }

  return { afterMarginBlockId, beforeMarginBlockId };
}

function focusUnitTarget(
  dependencies: EditorialUnitActionDependencies,
  manuscriptBlockId: string,
  preferredPane: "left" | "center",
  marginBlockId?: string | null,
): void {
  if (preferredPane === "left" && marginBlockId) {
    dependencies.focusMarginBlockById(marginBlockId);
    dependencies.focusMarginEditor();
    dependencies.setActivePane("left");
    return;
  }

  dependencies.focusManuscriptBlockById(manuscriptBlockId);
  dependencies.focusManuscriptEditor();
  dependencies.setActivePane("center");
}

function reorderLinkedMarginBlocks(
  dependencies: EditorialUnitActionDependencies,
  manuscriptBlockId: string,
  marginBlockIds: string[],
): void {
  if (marginBlockIds.length === 0) {
    return;
  }

  const excludedMarginBlockIds = new Set(marginBlockIds);
  const { afterMarginBlockId, beforeMarginBlockId } = findLinkedNeighborAnchors(
    dependencies,
    manuscriptBlockId,
    excludedMarginBlockIds,
  );

  if (afterMarginBlockId) {
    let anchorMarginBlockId = afterMarginBlockId;
    for (const marginBlockId of marginBlockIds) {
      dependencies.moveMarginBlockAfter(marginBlockId, anchorMarginBlockId, { select: false });
      anchorMarginBlockId = marginBlockId;
    }
    return;
  }

  if (beforeMarginBlockId) {
    for (let index = marginBlockIds.length - 1; index >= 0; index -= 1) {
      dependencies.moveMarginBlockBefore(marginBlockIds[index], beforeMarginBlockId, { select: false });
    }
  }
}

export function createEditorialUnitCoordinator(
  dependencies: EditorialUnitActionDependencies,
): {
  hasAnyUnits: () => boolean;
  canResolveCurrentUnit: () => boolean;
  createUnitBefore: () => string | null;
  createUnitAfter: () => string | null;
  createUnitBeforeBlock: (manuscriptBlockId: string) => string | null;
  createUnitAfterBlock: (manuscriptBlockId: string) => string | null;
  createUnitAtStart: () => string | null;
  createUnitAtEnd: () => string | null;
  duplicateCurrentUnit: () => string | null;
  moveCurrentUnitUp: () => boolean;
  moveCurrentUnitDown: () => boolean;
  deleteCurrentUnit: () => string | null;
} {
  const run = <T>(message: string, action: () => T): T | null => {
    try {
      return action();
    } catch (error) {
      dependencies.reportError(message, error);
      return null;
    }
  };

  const resolveInsertionAnchor = (
    position: "before" | "after",
    manuscriptBlockId?: string | null,
  ): string | null => {
    if (manuscriptBlockId) {
      return manuscriptBlockId;
    }

    const manuscriptBlockIds = dependencies.listManuscriptBlockIds();
    if (manuscriptBlockIds.length === 0) {
      return null;
    }

    return position === "before"
      ? manuscriptBlockIds[0] ?? null
      : manuscriptBlockIds[manuscriptBlockIds.length - 1] ?? null;
  };

  const createUnitAtAnchor = (
    position: "before" | "after",
    manuscriptBlockId?: string | null,
    preferredPane: "left" | "center" = "center",
  ): string | null =>
    run("A unit could not be created.", () => {
      const anchorManuscriptBlockId = resolveInsertionAnchor(position, manuscriptBlockId);

      const createdManuscriptBlockId =
        position === "before"
          ? dependencies.insertManuscriptBlockBefore(anchorManuscriptBlockId)
          : dependencies.insertManuscriptBlockAfter(anchorManuscriptBlockId);
      if (!createdManuscriptBlockId) {
        return null;
      }

      const { afterMarginBlockId, beforeMarginBlockId } = findLinkedNeighborAnchors(
        dependencies,
        createdManuscriptBlockId,
      );
      const createdMarginBlockId = dependencies.insertLinkedMarginBlock(createdManuscriptBlockId, {
        afterMarginBlockId,
        beforeMarginBlockId,
        select: false,
      });

      focusUnitTarget(
        dependencies,
        createdManuscriptBlockId,
        preferredPane,
        createdMarginBlockId,
      );

      return createdManuscriptBlockId;
    }) ?? null;

  const createUnitAtCurrentSelection = (
    position: "before" | "after",
  ): string | null => {
    const currentUnit = resolveCurrentUnitSelection(dependencies);
    if (!currentUnit) {
      return null;
    }

    return createUnitAtAnchor(
      position,
      currentUnit.manuscriptBlockId,
      currentUnit.preferredPane,
    );
  };

  return {
    hasAnyUnits: () => dependencies.listManuscriptBlockIds().length > 0,
    canResolveCurrentUnit: () => resolveCurrentUnitSelection(dependencies) != null,
    createUnitBefore: () => createUnitAtCurrentSelection("before"),
    createUnitAfter: () => createUnitAtCurrentSelection("after"),
    createUnitBeforeBlock: (manuscriptBlockId) =>
      createUnitAtAnchor("before", manuscriptBlockId, "center"),
    createUnitAfterBlock: (manuscriptBlockId) =>
      createUnitAtAnchor("after", manuscriptBlockId, "center"),
    createUnitAtStart: () => createUnitAtAnchor("before", null, "center"),
    createUnitAtEnd: () => createUnitAtAnchor("after", null, "center"),
    duplicateCurrentUnit: () =>
      run("A unit could not be duplicated.", () => {
        const currentUnit = resolveCurrentUnitSelection(dependencies);
        if (!currentUnit) {
          return null;
        }

        const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
          currentUnit.manuscriptBlockId,
        );
        const duplicatedManuscriptBlockId = dependencies.duplicateManuscriptBlock(
          currentUnit.manuscriptBlockId,
        );
        if (!duplicatedManuscriptBlockId) {
          return null;
        }

        let duplicatedMarginBlockId: string | null = null;
        const primaryMarginBlockId = linkedMarginBlockIds[0] ?? null;
        if (primaryMarginBlockId) {
          const { afterMarginBlockId, beforeMarginBlockId } = findLinkedNeighborAnchors(
            dependencies,
            duplicatedManuscriptBlockId,
          );
          duplicatedMarginBlockId = dependencies.duplicateMarginBlock(primaryMarginBlockId, {
            linkedManuscriptBlockId: duplicatedManuscriptBlockId,
            afterMarginBlockId,
            beforeMarginBlockId,
            select: false,
          });
        }

        focusUnitTarget(
          dependencies,
          duplicatedManuscriptBlockId,
          currentUnit.preferredPane,
          duplicatedMarginBlockId,
        );

        return duplicatedManuscriptBlockId;
      }) ?? null,
    moveCurrentUnitUp: () =>
      Boolean(
        run("A unit could not be moved.", () => {
          const currentUnit = resolveCurrentUnitSelection(dependencies);
          if (!currentUnit) {
            return false;
          }

          const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
            currentUnit.manuscriptBlockId,
          );
          const movedManuscriptBlockId = dependencies.moveManuscriptBlockUp(currentUnit.manuscriptBlockId);
          if (!movedManuscriptBlockId) {
            return false;
          }

          reorderLinkedMarginBlocks(
            dependencies,
            currentUnit.manuscriptBlockId,
            linkedMarginBlockIds,
          );

          const focusedMarginBlockId =
            currentUnit.preferredMarginBlockId &&
            linkedMarginBlockIds.includes(currentUnit.preferredMarginBlockId)
              ? currentUnit.preferredMarginBlockId
              : linkedMarginBlockIds[0] ?? null;

          focusUnitTarget(
            dependencies,
            currentUnit.manuscriptBlockId,
            currentUnit.preferredPane,
            focusedMarginBlockId,
          );

          return true;
        }),
      ),
    moveCurrentUnitDown: () =>
      Boolean(
        run("A unit could not be moved.", () => {
          const currentUnit = resolveCurrentUnitSelection(dependencies);
          if (!currentUnit) {
            return false;
          }

          const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
            currentUnit.manuscriptBlockId,
          );
          const movedManuscriptBlockId = dependencies.moveManuscriptBlockDown(currentUnit.manuscriptBlockId);
          if (!movedManuscriptBlockId) {
            return false;
          }

          reorderLinkedMarginBlocks(
            dependencies,
            currentUnit.manuscriptBlockId,
            linkedMarginBlockIds,
          );

          const focusedMarginBlockId =
            currentUnit.preferredMarginBlockId &&
            linkedMarginBlockIds.includes(currentUnit.preferredMarginBlockId)
              ? currentUnit.preferredMarginBlockId
              : linkedMarginBlockIds[0] ?? null;

          focusUnitTarget(
            dependencies,
            currentUnit.manuscriptBlockId,
            currentUnit.preferredPane,
            focusedMarginBlockId,
          );

          return true;
        }),
      ),
    deleteCurrentUnit: () =>
      run("A unit could not be deleted.", () => {
        const currentUnit = resolveCurrentUnitSelection(dependencies);
        if (!currentUnit) {
          return null;
        }

        const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
          currentUnit.manuscriptBlockId,
        );
        dependencies.deleteMarginBlocks(linkedMarginBlockIds);

        const nextManuscriptBlockId = dependencies.deleteManuscriptBlock(currentUnit.manuscriptBlockId);
        if (!nextManuscriptBlockId) {
          return null;
        }

        const nextLinkedMarginBlockIds =
          dependencies.findMarginBlockIdsForLinkedManuscript(nextManuscriptBlockId);
        const preferredPane =
          currentUnit.preferredPane === "left" && nextLinkedMarginBlockIds.length > 0
            ? "left"
            : "center";

        focusUnitTarget(
          dependencies,
          nextManuscriptBlockId,
          preferredPane,
          nextLinkedMarginBlockIds[0] ?? null,
        );

        return nextManuscriptBlockId;
      }) ?? null,
  };
}
