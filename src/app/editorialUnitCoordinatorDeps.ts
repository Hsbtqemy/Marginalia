import type { MutableRefObject } from "react";
import type { LeftMarginEditorHandle } from "../editors/margin/LeftMarginEditor";
import type { ManuscriptEditorHandle } from "../editors/manuscript/ManuscriptEditor";
import type { EditorialActionPane, EditorialUnitActionDependencies } from "./editorialUnitActions";

interface EditorialUnitCoordinatorDepsInput {
  activePane: EditorialActionPane;
  setActivePane: (pane: "left" | "center") => void;
  getCurrentManuscriptBlockId: () => string | null;
  getCurrentLeftMarginBlockId: () => string | null;
  manuscriptEditorRef: MutableRefObject<ManuscriptEditorHandle | null>;
  leftEditorRef: MutableRefObject<LeftMarginEditorHandle | null>;
  reportError: (message: string, error: unknown) => void;
}

export function createEditorialUnitCoordinatorDependencies(
  input: EditorialUnitCoordinatorDepsInput,
): EditorialUnitActionDependencies {
  return {
    getActivePane: () => input.activePane,
    setActivePane: input.setActivePane,
    getCurrentManuscriptBlockId: input.getCurrentManuscriptBlockId,
    getCurrentLeftMarginBlockId: input.getCurrentLeftMarginBlockId,
    listManuscriptBlockIds: () => input.manuscriptEditorRef.current?.listBlockIds() ?? [],
    insertManuscriptBlockBefore: (blockId) => input.manuscriptEditorRef.current?.insertBlockBefore(blockId) ?? null,
    insertManuscriptBlockAfter: (blockId) => input.manuscriptEditorRef.current?.insertBlockAfter(blockId) ?? null,
    duplicateManuscriptBlock: (blockId) => input.manuscriptEditorRef.current?.duplicateBlock(blockId) ?? null,
    moveManuscriptBlockUp: (blockId) => input.manuscriptEditorRef.current?.moveBlockUp(blockId) ?? null,
    moveManuscriptBlockDown: (blockId) => input.manuscriptEditorRef.current?.moveBlockDown(blockId) ?? null,
    deleteManuscriptBlock: (blockId) => input.manuscriptEditorRef.current?.deleteBlock(blockId) ?? null,
    findMarginBlockIdsForLinkedManuscript: (manuscriptBlockId) =>
      input.leftEditorRef.current?.findBlockIdsForLinkedManuscript(manuscriptBlockId) ?? [],
    getLinkedManuscriptBlockIdForMarginBlock: (marginBlockId) =>
      input.leftEditorRef.current?.getLinkedManuscriptBlockIdForBlock(marginBlockId) ?? null,
    insertLinkedMarginBlock: (manuscriptBlockId, options) =>
      input.leftEditorRef.current?.insertBlock(manuscriptBlockId, options) ?? null,
    duplicateMarginBlock: (marginBlockId, options) =>
      input.leftEditorRef.current?.duplicateBlockById(marginBlockId, options) ?? null,
    moveMarginBlockBefore: (marginBlockId, beforeMarginBlockId, options) =>
      input.leftEditorRef.current?.moveBlockBefore(marginBlockId, beforeMarginBlockId, options) ?? false,
    moveMarginBlockAfter: (marginBlockId, afterMarginBlockId, options) =>
      input.leftEditorRef.current?.moveBlockAfter(marginBlockId, afterMarginBlockId, options) ?? false,
    deleteMarginBlocks: (marginBlockIds) => input.leftEditorRef.current?.deleteBlocksById(marginBlockIds) ?? 0,
    focusManuscriptBlockById: (manuscriptBlockId) => {
      input.manuscriptEditorRef.current?.focusBlockById(manuscriptBlockId);
    },
    focusManuscriptEditor: () => {
      input.manuscriptEditorRef.current?.focusEditor();
    },
    focusMarginBlockById: (marginBlockId) => {
      input.leftEditorRef.current?.focusBlockById(marginBlockId);
    },
    focusMarginEditor: () => {
      input.leftEditorRef.current?.focusEditor();
    },
    reportError: input.reportError,
  };
}
