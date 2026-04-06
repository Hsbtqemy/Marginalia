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

function createUnitSelection(
  manuscriptBlockId: string | null,
  options?: {
    preferredPane?: "left" | "center";
    preferredMarginBlockId?: string | null;
  },
): EditorialUnitSelection | null {
  if (!manuscriptBlockId) {
    return null;
  }

  return {
    manuscriptBlockId,
    preferredPane: options?.preferredPane ?? "center",
    preferredMarginBlockId: options?.preferredMarginBlockId ?? null,
  };
}

function resolveCurrentUnitSelection(
  dependencies: EditorialUnitActionDependencies,
): EditorialUnitSelection | null {
  const activePane = dependencies.getActivePane();
  const currentMarginBlockId = dependencies.getCurrentLeftMarginBlockId();
  const currentManuscriptBlockId = dependencies.getCurrentManuscriptBlockId();

  if (activePane === "left" && currentMarginBlockId) {
    return createUnitSelection(
      dependencies.getLinkedManuscriptBlockIdForMarginBlock(currentMarginBlockId),
      {
        preferredPane: "left",
        preferredMarginBlockId: currentMarginBlockId,
      },
    );
  }

  if (currentManuscriptBlockId) {
    return createUnitSelection(currentManuscriptBlockId, {
      preferredPane: "center",
      preferredMarginBlockId: null,
    });
  }

  if (currentMarginBlockId) {
    return createUnitSelection(
      dependencies.getLinkedManuscriptBlockIdForMarginBlock(currentMarginBlockId),
      {
        preferredPane: "left",
        preferredMarginBlockId: currentMarginBlockId,
      },
    );
  }

  return null;
}

function resolveUnitSelectionFromMarginBlock(
  dependencies: EditorialUnitActionDependencies,
  marginBlockId: string,
): EditorialUnitSelection | null {
  return createUnitSelection(
    dependencies.getLinkedManuscriptBlockIdForMarginBlock(marginBlockId),
    {
      preferredPane: "left",
      preferredMarginBlockId: marginBlockId,
    },
  );
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
  moveUnitUpFromMarginBlock: (marginBlockId: string) => boolean;
  moveUnitDownFromMarginBlock: (marginBlockId: string) => boolean;
  moveUnitToMarginTargetFromMarginBlock: (
    sourceMarginBlockId: string,
    targetMarginBlockId: string,
    position: "before" | "after",
  ) => boolean;
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

  const moveUnit = (
    direction: "up" | "down",
    selection: EditorialUnitSelection | null,
  ): boolean =>
    Boolean(
      run("A unit could not be moved.", () => {
        if (!selection) {
          return false;
        }

        const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
          selection.manuscriptBlockId,
        );
        const movedManuscriptBlockId =
          direction === "up"
            ? dependencies.moveManuscriptBlockUp(selection.manuscriptBlockId)
            : dependencies.moveManuscriptBlockDown(selection.manuscriptBlockId);
        if (!movedManuscriptBlockId) {
          return false;
        }

        reorderLinkedMarginBlocks(
          dependencies,
          selection.manuscriptBlockId,
          linkedMarginBlockIds,
        );

        const focusedMarginBlockId =
          selection.preferredMarginBlockId &&
          linkedMarginBlockIds.includes(selection.preferredMarginBlockId)
            ? selection.preferredMarginBlockId
            : linkedMarginBlockIds[0] ?? null;

        focusUnitTarget(
          dependencies,
          selection.manuscriptBlockId,
          selection.preferredPane,
          focusedMarginBlockId,
        );

        return true;
      }),
    );

  const moveUnitToMarginTarget = (
    sourceMarginBlockId: string,
    targetMarginBlockId: string,
    position: "before" | "after",
  ): boolean =>
    Boolean(
      run("A unit could not be moved.", () => {
        const sourceSelection = resolveUnitSelectionFromMarginBlock(dependencies, sourceMarginBlockId);
        const targetSelection = resolveUnitSelectionFromMarginBlock(dependencies, targetMarginBlockId);
        if (!sourceSelection || !targetSelection) {
          return false;
        }
        if (sourceSelection.manuscriptBlockId === targetSelection.manuscriptBlockId) {
          return false;
        }

        const manuscriptBlockIds = dependencies.listManuscriptBlockIds();
        let sourceIndex = manuscriptBlockIds.indexOf(sourceSelection.manuscriptBlockId);
        const targetIndex = manuscriptBlockIds.indexOf(targetSelection.manuscriptBlockId);
        if (sourceIndex < 0 || targetIndex < 0) {
          return false;
        }

        let desiredIndex = position === "before" ? targetIndex : targetIndex + 1;
        if (sourceIndex < desiredIndex) {
          desiredIndex -= 1;
        }
        desiredIndex = Math.max(0, Math.min(manuscriptBlockIds.length - 1, desiredIndex));
        if (sourceIndex === desiredIndex) {
          return false;
        }

        const linkedMarginBlockIds = dependencies.findMarginBlockIdsForLinkedManuscript(
          sourceSelection.manuscriptBlockId,
        );

        while (sourceIndex > desiredIndex) {
          const moved = dependencies.moveManuscriptBlockUp(sourceSelection.manuscriptBlockId);
          if (!moved) {
            return false;
          }
          sourceIndex -= 1;
        }

        while (sourceIndex < desiredIndex) {
          const moved = dependencies.moveManuscriptBlockDown(sourceSelection.manuscriptBlockId);
          if (!moved) {
            return false;
          }
          sourceIndex += 1;
        }

        reorderLinkedMarginBlocks(
          dependencies,
          sourceSelection.manuscriptBlockId,
          linkedMarginBlockIds,
        );

        const focusedMarginBlockId =
          sourceSelection.preferredMarginBlockId &&
          linkedMarginBlockIds.includes(sourceSelection.preferredMarginBlockId)
            ? sourceSelection.preferredMarginBlockId
            : linkedMarginBlockIds[0] ?? null;

        focusUnitTarget(
          dependencies,
          sourceSelection.manuscriptBlockId,
          sourceSelection.preferredPane,
          focusedMarginBlockId,
        );

        return true;
      }),
    );

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
    moveCurrentUnitUp: () => moveUnit("up", resolveCurrentUnitSelection(dependencies)),
    moveCurrentUnitDown: () => moveUnit("down", resolveCurrentUnitSelection(dependencies)),
    moveUnitUpFromMarginBlock: (marginBlockId) =>
      moveUnit("up", resolveUnitSelectionFromMarginBlock(dependencies, marginBlockId)),
    moveUnitDownFromMarginBlock: (marginBlockId) =>
      moveUnit("down", resolveUnitSelectionFromMarginBlock(dependencies, marginBlockId)),
    moveUnitToMarginTargetFromMarginBlock: (sourceMarginBlockId, targetMarginBlockId, position) =>
      moveUnitToMarginTarget(sourceMarginBlockId, targetMarginBlockId, position),
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
