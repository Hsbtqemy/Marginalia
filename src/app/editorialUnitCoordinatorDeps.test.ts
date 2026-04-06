import test from "node:test";
import assert from "node:assert/strict";
import type { MutableRefObject } from "react";
import type { LeftMarginEditorHandle } from "../editors/margin/LeftMarginEditor";
import type { ManuscriptEditorHandle } from "../editors/manuscript/ManuscriptEditor";
import { createEditorialUnitCoordinator } from "./editorialUnitActions";
import { createEditorialUnitCoordinatorDependencies } from "./editorialUnitCoordinatorDeps";

interface FakeLeftBlock {
  marginBlockId: string;
  linkedManuscriptBlockId: string | null;
}

test("app bridge integration keeps manuscript and left margin aligned when creating a unit", () => {
  let activePane: "left" | "center" | "right" | null = "center";
  let currentManuscriptBlockId: string | null = "m-1";
  let currentLeftMarginBlockId: string | null = null;
  const manuscriptBlockIds = ["m-1", "m-2"];
  const leftBlocks: FakeLeftBlock[] = [
    { marginBlockId: "left-1", linkedManuscriptBlockId: "m-1" },
    { marginBlockId: "left-2", linkedManuscriptBlockId: "m-2" },
  ];
  const focusLog: string[] = [];

  const manuscriptEditorRef = {
    current: {
      focusBlockById: (blockId: string) => {
        currentManuscriptBlockId = blockId;
        focusLog.push(`manuscript:${blockId}`);
      },
      focusEditor: () => {
        focusLog.push("editor:center");
      },
      getHtml: () => "",
      getLexicalJson: () => "",
      listBlockIds: () => [...manuscriptBlockIds],
      ensureCurrentSelectionBlockId: () => currentManuscriptBlockId,
      createLinkedPassageBlock: () => null,
      insertBlockBefore: () => null,
      insertBlockAfter: (blockId?: string | null) => {
        assert.equal(blockId, "m-1");
        manuscriptBlockIds.splice(1, 0, "m-3");
        currentManuscriptBlockId = "m-3";
        return "m-3";
      },
      duplicateBlock: () => null,
      moveBlockUp: () => null,
      moveBlockDown: () => null,
      deleteBlock: () => null,
    } satisfies ManuscriptEditorHandle,
  } as MutableRefObject<ManuscriptEditorHandle | null>;

  const leftEditorRef = {
    current: {
      insertBlock: (
        linkedManuscriptBlockId: string | null,
        options?: {
          afterMarginBlockId?: string | null;
          beforeMarginBlockId?: string | null;
          select?: boolean;
        },
      ) => {
        assert.equal(linkedManuscriptBlockId, "m-3");
        assert.equal(options?.afterMarginBlockId, "left-1");
        assert.equal(options?.beforeMarginBlockId, "left-2");
        assert.equal(options?.select, false);
        leftBlocks.splice(1, 0, { marginBlockId: "left-3", linkedManuscriptBlockId: "m-3" });
        return "left-3";
      },
      revealForManuscriptBlock: () => undefined,
      findBlockIdForLinkedManuscript: (manuscriptBlockId: string) =>
        leftBlocks.find((block) => block.linkedManuscriptBlockId === manuscriptBlockId)?.marginBlockId ?? null,
      findBlockIdsForLinkedManuscript: (manuscriptBlockId: string) =>
        leftBlocks
          .filter((block) => block.linkedManuscriptBlockId === manuscriptBlockId)
          .map((block) => block.marginBlockId),
      getLinkedManuscriptBlockIdForBlock: (marginBlockId: string) =>
        leftBlocks.find((block) => block.marginBlockId === marginBlockId)?.linkedManuscriptBlockId ?? null,
      focusBlockById: (marginBlockId: string) => {
        currentLeftMarginBlockId = marginBlockId;
        focusLog.push(`left:${marginBlockId}`);
      },
      focusEditor: () => {
        focusLog.push("editor:left");
      },
      getLexicalJson: () => "",
      linkCurrentToManuscript: () => undefined,
      unlinkCurrent: () => undefined,
      moveCurrentUp: () => undefined,
      moveCurrentDown: () => undefined,
      duplicateCurrent: () => undefined,
      splitCurrent: () => undefined,
      mergeCurrentUp: () => undefined,
      mergeCurrentDown: () => undefined,
      deleteCurrent: () => undefined,
      duplicateBlockById: () => null,
      moveBlockBefore: () => false,
      moveBlockAfter: () => false,
      deleteBlocksById: () => 0,
      goToLinkedManuscript: () => undefined,
      normalizeLegacyLinkedDuplicates: () => 0,
    } satisfies LeftMarginEditorHandle,
  } as MutableRefObject<LeftMarginEditorHandle | null>;

  const coordinator = createEditorialUnitCoordinator(
    createEditorialUnitCoordinatorDependencies({
      activePane,
      setActivePane: (pane) => {
        activePane = pane;
      },
      getCurrentManuscriptBlockId: () => currentManuscriptBlockId,
      getCurrentLeftMarginBlockId: () => currentLeftMarginBlockId,
      manuscriptEditorRef,
      leftEditorRef,
      reportError: (message, error) => {
        throw new Error(`Unexpected coordinator error: ${message} ${String(error)}`);
      },
    }),
  );

  const createdBlockId = coordinator.createUnitAfter();

  assert.equal(createdBlockId, "m-3");
  assert.deepEqual(manuscriptBlockIds, ["m-1", "m-3", "m-2"]);
  assert.deepEqual(
    leftBlocks.map((block) => [block.marginBlockId, block.linkedManuscriptBlockId]),
    [
      ["left-1", "m-1"],
      ["left-3", "m-3"],
      ["left-2", "m-2"],
    ],
  );
  assert.deepEqual(focusLog, ["manuscript:m-3", "editor:center"]);
  assert.equal(activePane, "center");
});
