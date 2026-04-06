import test from "node:test";
import assert from "node:assert/strict";
import {
  createEditorialUnitCoordinator,
  type EditorialActionPane,
  type EditorialUnitActionDependencies,
} from "./editorialUnitActions";

interface FakeLeftBlock {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
  text: string;
}

class FakeEditorialEnvironment {
  manuscriptBlockIds: string[];
  leftBlocks: FakeLeftBlock[];
  activePane: EditorialActionPane;
  currentManuscriptBlockId: string | null;
  currentLeftMarginBlockId: string | null;
  focused: string[] = [];
  reportedErrors: Array<{ message: string; error: unknown }> = [];

  private nextManuscriptId = 100;
  private nextMarginId = 100;

  constructor(options: {
    manuscriptBlockIds: string[];
    leftBlocks: FakeLeftBlock[];
    activePane: EditorialActionPane;
    currentManuscriptBlockId?: string | null;
    currentLeftMarginBlockId?: string | null;
  }) {
    this.manuscriptBlockIds = [...options.manuscriptBlockIds];
    this.leftBlocks = options.leftBlocks.map((block) => ({ ...block }));
    this.activePane = options.activePane;
    this.currentManuscriptBlockId = options.currentManuscriptBlockId ?? null;
    this.currentLeftMarginBlockId = options.currentLeftMarginBlockId ?? null;
  }

  private createManuscriptBlockId(): string {
    return `m-${this.nextManuscriptId++}`;
  }

  private createMarginBlockId(): string {
    return `left-${this.nextMarginId++}`;
  }

  private insertMarginBlockAt(
    block: FakeLeftBlock,
    options?: {
      afterMarginBlockId?: string | null;
      beforeMarginBlockId?: string | null;
      select?: boolean;
    },
  ): string {
    const afterIndex =
      options?.afterMarginBlockId != null
        ? this.leftBlocks.findIndex((candidate) => candidate.marginBlockId === options.afterMarginBlockId)
        : -1;
    const beforeIndex =
      options?.beforeMarginBlockId != null
        ? this.leftBlocks.findIndex((candidate) => candidate.marginBlockId === options.beforeMarginBlockId)
        : -1;

    if (afterIndex >= 0) {
      this.leftBlocks.splice(afterIndex + 1, 0, block);
    } else if (beforeIndex >= 0) {
      this.leftBlocks.splice(beforeIndex, 0, block);
    } else {
      this.leftBlocks.push(block);
    }

    if (options?.select ?? true) {
      this.currentLeftMarginBlockId = block.marginBlockId;
    }

    return block.marginBlockId;
  }

  private moveMarginBlock(fromBlockId: string, targetBlockId: string, position: "before" | "after"): boolean {
    const fromIndex = this.leftBlocks.findIndex((block) => block.marginBlockId === fromBlockId);
    const targetIndex = this.leftBlocks.findIndex((block) => block.marginBlockId === targetBlockId);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
      return false;
    }

    const [block] = this.leftBlocks.splice(fromIndex, 1);
    const nextTargetIndex = this.leftBlocks.findIndex((candidate) => candidate.marginBlockId === targetBlockId);
    const insertionIndex = position === "before" ? nextTargetIndex : nextTargetIndex + 1;
    this.leftBlocks.splice(insertionIndex, 0, block);
    return true;
  }

  dependencies(): EditorialUnitActionDependencies {
    return {
      getActivePane: () => this.activePane,
      setActivePane: (pane) => {
        this.activePane = pane;
      },
      getCurrentManuscriptBlockId: () => this.currentManuscriptBlockId,
      getCurrentLeftMarginBlockId: () => this.currentLeftMarginBlockId,
      listManuscriptBlockIds: () => [...this.manuscriptBlockIds],
      insertManuscriptBlockBefore: (blockId) => {
        const createdBlockId = this.createManuscriptBlockId();
        if (blockId == null) {
          this.manuscriptBlockIds.unshift(createdBlockId);
        } else {
          const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
          if (currentIndex < 0) {
            return null;
          }
          this.manuscriptBlockIds.splice(currentIndex, 0, createdBlockId);
        }
        this.currentManuscriptBlockId = createdBlockId;
        return createdBlockId;
      },
      insertManuscriptBlockAfter: (blockId) => {
        const createdBlockId = this.createManuscriptBlockId();
        if (blockId == null) {
          this.manuscriptBlockIds.push(createdBlockId);
        } else {
          const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
          if (currentIndex < 0) {
            return null;
          }
          this.manuscriptBlockIds.splice(currentIndex + 1, 0, createdBlockId);
        }
        this.currentManuscriptBlockId = createdBlockId;
        return createdBlockId;
      },
      duplicateManuscriptBlock: (blockId) => {
        const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
        if (currentIndex < 0) {
          return null;
        }
        const createdBlockId = this.createManuscriptBlockId();
        this.manuscriptBlockIds.splice(currentIndex + 1, 0, createdBlockId);
        this.currentManuscriptBlockId = createdBlockId;
        return createdBlockId;
      },
      moveManuscriptBlockUp: (blockId) => {
        const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
        if (currentIndex <= 0) {
          return null;
        }
        const [block] = this.manuscriptBlockIds.splice(currentIndex, 1);
        this.manuscriptBlockIds.splice(currentIndex - 1, 0, block);
        this.currentManuscriptBlockId = blockId;
        return blockId;
      },
      moveManuscriptBlockDown: (blockId) => {
        const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
        if (currentIndex < 0 || currentIndex >= this.manuscriptBlockIds.length - 1) {
          return null;
        }
        const [block] = this.manuscriptBlockIds.splice(currentIndex, 1);
        this.manuscriptBlockIds.splice(currentIndex + 1, 0, block);
        this.currentManuscriptBlockId = blockId;
        return blockId;
      },
      deleteManuscriptBlock: (blockId) => {
        const currentIndex = this.manuscriptBlockIds.indexOf(blockId);
        if (currentIndex < 0) {
          return null;
        }

        this.manuscriptBlockIds.splice(currentIndex, 1);
        const nextBlockId =
          this.manuscriptBlockIds[currentIndex] ??
          this.manuscriptBlockIds[currentIndex - 1] ??
          this.createManuscriptBlockId();
        if (this.manuscriptBlockIds.length === 0) {
          this.manuscriptBlockIds.push(nextBlockId);
        }
        this.currentManuscriptBlockId = nextBlockId;
        return nextBlockId;
      },
      findMarginBlockIdsForLinkedManuscript: (manuscriptBlockId) =>
        this.leftBlocks
          .filter((block) => block.linkedManuscriptBlockId === manuscriptBlockId)
          .map((block) => block.marginBlockId),
      getLinkedManuscriptBlockIdForMarginBlock: (marginBlockId) =>
        this.leftBlocks.find((block) => block.marginBlockId === marginBlockId)?.linkedManuscriptBlockId ?? null,
      insertLinkedMarginBlock: (manuscriptBlockId, options) =>
        this.insertMarginBlockAt(
          {
            marginBlockId: this.createMarginBlockId(),
            linkedManuscriptBlockId: manuscriptBlockId,
            text: "",
          },
          options,
        ),
      duplicateMarginBlock: (marginBlockId, options) => {
        const source = this.leftBlocks.find((block) => block.marginBlockId === marginBlockId);
        if (!source) {
          return null;
        }

        return this.insertMarginBlockAt(
          {
            marginBlockId: this.createMarginBlockId(),
            linkedManuscriptBlockId:
              options?.linkedManuscriptBlockId === undefined
                ? source.linkedManuscriptBlockId
                : options.linkedManuscriptBlockId,
            text: source.text,
          },
          options,
        );
      },
      moveMarginBlockBefore: (marginBlockId, beforeMarginBlockId) =>
        this.moveMarginBlock(marginBlockId, beforeMarginBlockId, "before"),
      moveMarginBlockAfter: (marginBlockId, afterMarginBlockId) =>
        this.moveMarginBlock(marginBlockId, afterMarginBlockId, "after"),
      deleteMarginBlocks: (marginBlockIds) => {
        const targetIds = new Set(marginBlockIds);
        const beforeCount = this.leftBlocks.length;
        this.leftBlocks = this.leftBlocks.filter((block) => !targetIds.has(block.marginBlockId));
        if (this.currentLeftMarginBlockId && targetIds.has(this.currentLeftMarginBlockId)) {
          this.currentLeftMarginBlockId = null;
        }
        return beforeCount - this.leftBlocks.length;
      },
      focusManuscriptBlockById: (manuscriptBlockId) => {
        this.focused.push(`manuscript:${manuscriptBlockId}`);
        this.currentManuscriptBlockId = manuscriptBlockId;
      },
      focusManuscriptEditor: () => {
        this.focused.push("editor:center");
      },
      focusMarginBlockById: (marginBlockId) => {
        this.focused.push(`left:${marginBlockId}`);
        this.currentLeftMarginBlockId = marginBlockId;
      },
      focusMarginEditor: () => {
        this.focused.push("editor:left");
      },
      reportError: (message, error) => {
        this.reportedErrors.push({ message, error });
      },
    };
  }
}

function linkedMarginBlockIdsFor(environment: FakeEditorialEnvironment, manuscriptBlockId: string): string[] {
  return environment.leftBlocks
    .filter((block) => block.linkedManuscriptBlockId === manuscriptBlockId)
    .map((block) => block.marginBlockId);
}

test("createUnitAfter inserts a linked scholie in manuscript order and keeps focus in the manuscript pane", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Scholie A" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Scholie B" },
    ],
    activePane: "center",
    currentManuscriptBlockId: "m-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const createdBlockId = coordinator.createUnitAfter();

  assert.equal(createdBlockId, "m-100");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1", "m-100", "m-2"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-1", "m-1"],
      ["left-100", "m-100"],
      ["left-2", "m-2"],
    ],
  );
  assert.deepEqual(environment.focused, ["manuscript:m-100", "editor:center"]);
  assert.equal(environment.activePane, "center");
});

test("scholie invariant: creating a unit gives the new passage exactly one linked left scholie", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Scholie A" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Scholie B" },
    ],
    activePane: "center",
    currentManuscriptBlockId: "m-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const createdBlockId = coordinator.createUnitAfter();

  assert.equal(createdBlockId, "m-100");
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-100"), ["left-100"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-1"), ["left-1"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-2"), ["left-2"]);
});

test("createUnitAfterBlock inserts a linked unit without requiring a current selection", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Scholie A" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Scholie B" },
    ],
    activePane: null,
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const createdBlockId = coordinator.createUnitAfterBlock("m-1");

  assert.equal(createdBlockId, "m-100");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1", "m-100", "m-2"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-1", "m-1"],
      ["left-100", "m-100"],
      ["left-2", "m-2"],
    ],
  );
  assert.deepEqual(environment.focused, ["manuscript:m-100", "editor:center"]);
});

test("createUnitAtEnd appends a new unit when no current selection is resolved", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [{ marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Scholie A" }],
    activePane: null,
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const createdBlockId = coordinator.createUnitAtEnd();

  assert.equal(createdBlockId, "m-100");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1", "m-2", "m-100"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-1", "m-1"],
      ["left-100", "m-100"],
    ],
  );
  assert.deepEqual(environment.focused, ["manuscript:m-100", "editor:center"]);
});

test("createUnitAtStart creates the first linked unit in an empty document", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: [],
    leftBlocks: [],
    activePane: null,
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const createdBlockId = coordinator.createUnitAtStart();

  assert.equal(createdBlockId, "m-100");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-100"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [["left-100", "m-100"]],
  );
  assert.deepEqual(environment.focused, ["manuscript:m-100", "editor:center"]);
});

test("duplicateCurrentUnit copies only the primary scholie for a legacy unit", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "center",
    currentManuscriptBlockId: "m-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const duplicatedBlockId = coordinator.duplicateCurrentUnit();

  assert.equal(duplicatedBlockId, "m-100");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1", "m-100", "m-2"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId, block.text]),
    [
      ["left-1", "m-1", "Primary scholie"],
      ["left-1-dup", "m-1", "Legacy duplicate"],
      ["left-100", "m-100", "Primary scholie"],
      ["left-2", "m-2", "Next scholie"],
    ],
  );
});

test("scholie invariant: duplicating a unit does not copy legacy duplicate scholies onto the new passage", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "center",
    currentManuscriptBlockId: "m-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const duplicatedBlockId = coordinator.duplicateCurrentUnit();

  assert.equal(duplicatedBlockId, "m-100");
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-1"), ["left-1", "left-1-dup"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-100"), ["left-100"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-2"), ["left-2"]);
});

test("moveCurrentUnitDown reorders the linked scholie cluster and preserves left focus", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Scholie A" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Scholie B" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveCurrentUnitDown();

  assert.equal(moved, true);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2", "m-1"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-2", "m-2"],
      ["left-1", "m-1"],
    ],
  );
  assert.deepEqual(environment.focused, ["left:left-1", "editor:left"]);
  assert.equal(environment.activePane, "left");
});

test("scholie invariant: moving a unit preserves the same linked scholie cluster for each passage", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1-dup",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveCurrentUnitDown();

  assert.equal(moved, true);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2", "m-1"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-1"), ["left-1", "left-1-dup"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-2"), ["left-2"]);
});

test("moveUnitDownFromMarginBlock reorders a linked unit even when the active pane is not left", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "center",
    currentManuscriptBlockId: "m-2",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveUnitDownFromMarginBlock("left-1-dup");

  assert.equal(moved, true);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2", "m-1"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-2", "m-2"],
      ["left-1", "m-1"],
      ["left-1-dup", "m-1"],
    ],
  );
  assert.deepEqual(environment.focused, ["left:left-1-dup", "editor:left"]);
  assert.equal(environment.activePane, "left");
});

test("moveUnitToMarginTargetFromMarginBlock reorders a linked unit after another linked unit", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2", "m-3"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "First scholie" },
      { marginBlockId: "left-free", linkedManuscriptBlockId: null, text: "Free scholie" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Second scholie" },
      { marginBlockId: "left-3", linkedManuscriptBlockId: "m-3", text: "Third scholie" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveUnitToMarginTargetFromMarginBlock("left-1", "left-3", "after");

  assert.equal(moved, true);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2", "m-3", "m-1"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-free", null],
      ["left-2", "m-2"],
      ["left-3", "m-3"],
      ["left-1", "m-1"],
    ],
  );
  assert.deepEqual(environment.focused, ["left:left-1", "editor:left"]);
  assert.equal(environment.activePane, "left");
});

test("moveUnitToMarginTargetFromMarginBlock ignores free scholies as drop anchors", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "First scholie" },
      { marginBlockId: "left-free", linkedManuscriptBlockId: null, text: "Free scholie" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Second scholie" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveUnitToMarginTargetFromMarginBlock("left-1", "left-free", "before");

  assert.equal(moved, false);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1", "m-2"]);
  assert.deepEqual(environment.focused, []);
});

test("moveUnitUpFromMarginBlock ignores free scholies that are not attached to a passage", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1"],
    leftBlocks: [{ marginBlockId: "left-free", linkedManuscriptBlockId: null, text: "Free scholie" }],
    activePane: "center",
    currentManuscriptBlockId: "m-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const moved = coordinator.moveUnitUpFromMarginBlock("left-free");

  assert.equal(moved, false);
  assert.deepEqual(environment.manuscriptBlockIds, ["m-1"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [["left-free", null]],
  );
  assert.deepEqual(environment.focused, []);
});

test("deleteCurrentUnit removes all linked scholies for a legacy unit and focuses the next scholie", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1-dup",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const focusedBlockId = coordinator.deleteCurrentUnit();

  assert.equal(focusedBlockId, "m-2");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2"]);
  assert.deepEqual(
    environment.leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [["left-2", "m-2"]],
  );
  assert.deepEqual(environment.focused, ["left:left-2", "editor:left"]);
  assert.equal(environment.activePane, "left");
});

test("scholie invariant: deleting a unit removes every scholie linked to the deleted passage", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1", "m-2"],
    leftBlocks: [
      { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1", text: "Primary scholie" },
      { marginBlockId: "left-1-dup", linkedManuscriptBlockId: "m-1", text: "Legacy duplicate" },
      { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2", text: "Next scholie" },
    ],
    activePane: "left",
    currentLeftMarginBlockId: "left-1",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  const focusedBlockId = coordinator.deleteCurrentUnit();

  assert.equal(focusedBlockId, "m-2");
  assert.deepEqual(environment.manuscriptBlockIds, ["m-2"]);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-1"), []);
  assert.deepEqual(linkedMarginBlockIdsFor(environment, "m-2"), ["left-2"]);
});

test("left-pane unit actions stay disabled when the selected scholie is not linked to a manuscript block", () => {
  const environment = new FakeEditorialEnvironment({
    manuscriptBlockIds: ["m-1"],
    leftBlocks: [{ marginBlockId: "left-free", linkedManuscriptBlockId: null, text: "Free scholie" }],
    activePane: "left",
    currentLeftMarginBlockId: "left-free",
  });
  const coordinator = createEditorialUnitCoordinator(environment.dependencies());

  assert.equal(coordinator.canResolveCurrentUnit(), false);
  assert.equal(coordinator.deleteCurrentUnit(), null);
  assert.deepEqual(environment.reportedErrors, []);
});
