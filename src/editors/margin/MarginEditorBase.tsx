import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { $setBlocksType } from "@lexical/selection";
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
} from "@lexical/rich-text";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalNode,
  type LexicalEditor,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { debounce } from "../../utils/debounce";
import { useAppStore } from "../../state/useAppStore";
import {
  DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND,
  DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND,
  LINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
  MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND,
  MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND,
  MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND,
  MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND,
  SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND,
  INSERT_MARGINALIA_BLOCK_COMMAND,
  UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND,
  $ensureFirstMarginaliaBlock,
  $findMarginaliaBlockById,
  $getCurrentMarginaliaBlockNode,
  registerMarginaliaCommands,
} from "./marginaliaBlocks/commands";
import {
  $isMarginaliaBlockNode,
  MarginaliaBlockNode,
  type MarginKind,
} from "./marginaliaBlocks/MarginaliaBlockNode";
import { buildMarginLinkIndexFromLexicalJson } from "./marginaliaBlocks/indexing";

const MARGIN_THEME = {
  paragraph: "",
  text: {
    bold: "",
    italic: "",
    underline: "",
  },
};

export interface MarginEditorHandle {
  insertBlock: (linkedManuscriptBlockId: string | null) => void;
  revealForManuscriptBlock: (manuscriptBlockId: string) => void;
  focusBlockById: (marginBlockId: string) => void;
  focusEditor: () => void;
  getLexicalJson: () => string;
  linkCurrentToManuscript: (manuscriptBlockId: string | null) => void;
  unlinkCurrent: () => void;
  moveCurrentUp: () => void;
  moveCurrentDown: () => void;
  duplicateCurrent: () => void;
  splitCurrent: () => void;
  mergeCurrentUp: () => void;
  mergeCurrentDown: () => void;
  deleteCurrent: () => void;
  goToLinkedManuscript: () => void;
}

interface MarginEditorBaseProps {
  kind: MarginKind;
  title: string;
  subtitle: string;
  initialStateJson: string;
  manuscriptExcerptByBlockId: Record<string, string>;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (marginBlockId: string | null) => void;
  onLinkIndexChange: (index: Record<string, string[]>) => void;
  onNavigateToManuscriptBlock: (manuscriptBlockId: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

type MarginBlockType = "paragraph" | "h1" | "h2" | "h3" | "quote" | "bullets" | "numbers" | "checklist";

interface MarginToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  blockType: MarginBlockType;
  linkedManuscriptBlockId: string | null;
}

type DropPosition = "before" | "after";

interface DragCandidate {
  marginBlockId: string;
  element: HTMLElement;
}

interface DragState {
  pointerId: number;
  sourceMarginBlockId: string;
  sourceHandle: HTMLElement;
  startX: number;
  startY: number;
  hasMoved: boolean;
  candidates: DragCandidate[];
  targetMarginBlockId: string | null;
  targetElement: HTMLElement | null;
  dropPosition: DropPosition | null;
  previousBodyUserSelect: string;
  previousBodyCursor: string;
}

const MARGIN_BLOCK_SELECTOR = "[data-margin-block-id]";
const MARGINALIA_HANDLE_SELECTOR = '[data-marginalia-handle="true"]';
const DEFAULT_MARGIN_TOOLBAR_STATE: MarginToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  blockType: "paragraph",
  linkedManuscriptBlockId: null,
};

function getMarginContentElement(node: LexicalNode | null): LexicalNode | null {
  let current = node;
  while (current != null) {
    const parent = current.getParent();
    if ($isMarginaliaBlockNode(parent)) {
      return current;
    }
    current = parent;
  }
  return null;
}

function readMarginToolbarState(): MarginToolbarState {
  const selection = $getSelection();
  const currentBlock = $getCurrentMarginaliaBlockNode();
  const nextState: MarginToolbarState = {
    ...DEFAULT_MARGIN_TOOLBAR_STATE,
    linkedManuscriptBlockId: currentBlock?.getLinkedManuscriptBlockId() ?? null,
  };

  if (!$isRangeSelection(selection)) {
    return nextState;
  }

  nextState.bold = selection.hasFormat("bold");
  nextState.italic = selection.hasFormat("italic");
  nextState.underline = selection.hasFormat("underline");

  const contentElement = getMarginContentElement(selection.anchor.getNode());
  if (contentElement instanceof HeadingNode) {
    const tag = contentElement.getTag();
    nextState.blockType = tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph";
    return nextState;
  }
  if (contentElement instanceof QuoteNode) {
    nextState.blockType = "quote";
    return nextState;
  }
  if (contentElement instanceof ListItemNode) {
    const list = contentElement.getParent();
    if (list instanceof ListNode) {
      const listType = list.getListType();
      nextState.blockType =
        listType === "number" ? "numbers" : listType === "check" ? "checklist" : "bullets";
    }
  }

  return nextState;
}

function syncLinkedPreviews(
  rootElement: HTMLElement | null,
  manuscriptExcerptByBlockId: Record<string, string>,
): void {
  if (!rootElement) {
    return;
  }

  const blocks = rootElement.querySelectorAll<HTMLElement>("[data-lexical-marginalia-block='true']");
  for (const block of blocks) {
    const preview = block.querySelector<HTMLElement>("[data-marginalia-preview='true']");
    if (!preview) {
      continue;
    }

    const linkedManuscriptBlockId = block.dataset.linkedManuscriptBlockId;
    if (!linkedManuscriptBlockId) {
      preview.hidden = true;
      preview.textContent = "";
      continue;
    }

    preview.hidden = false;
    preview.textContent =
      manuscriptExcerptByBlockId[linkedManuscriptBlockId] ?? "Linked passage unavailable in the manuscript.";
  }
}

function getMarginBlockElements(rootElement: HTMLElement): HTMLElement[] {
  return [...rootElement.querySelectorAll<HTMLElement>(MARGIN_BLOCK_SELECTOR)];
}

function collectDragCandidates(rootElement: HTMLElement, sourceMarginBlockId: string): DragCandidate[] {
  return getMarginBlockElements(rootElement)
    .map((element) => ({
      marginBlockId: element.dataset.marginBlockId ?? "",
      element,
    }))
    .filter(
      (candidate) =>
        candidate.marginBlockId.length > 0 && candidate.marginBlockId !== sourceMarginBlockId,
    );
}

function clearDropIndicators(rootElement: HTMLElement): void {
  for (const element of getMarginBlockElements(rootElement)) {
    delete element.dataset.dropPosition;
  }
}

function setDropIndicator(element: HTMLElement, position: DropPosition): void {
  element.dataset.dropPosition = position;
}

function updateGrabbedHandleState(rootElement: HTMLElement, grabbedMarginBlockId: string | null): void {
  const handles = rootElement.querySelectorAll<HTMLElement>(MARGINALIA_HANDLE_SELECTOR);
  for (const handle of handles) {
    const grabbed = handle.dataset.marginBlockId === grabbedMarginBlockId;
    handle.dataset.grabbed = grabbed ? "true" : "false";
    handle.setAttribute("aria-grabbed", grabbed ? "true" : "false");
  }
}

function findDropTarget(
  candidates: DragCandidate[],
  pointerY: number,
): { marginBlockId: string; position: DropPosition; element: HTMLElement } | null {
  if (candidates.length === 0) {
    return null;
  }

  for (const element of candidates) {
    const rect = element.element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    if (pointerY < centerY) {
      return {
        marginBlockId: element.marginBlockId,
        position: "before",
        element: element.element,
      };
    }
  }

  const last = candidates[candidates.length - 1];

  return {
    marginBlockId: last.marginBlockId,
    position: "after",
    element: last.element,
  };
}

function EnsureInitialBlockPlugin(props: { kind: MarginKind }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      $ensureFirstMarginaliaBlock(props.kind);
    });
  }, [editor, props.kind]);

  return null;
}

function MarginBridgePlugin(props: {
  kind: MarginKind;
  editorRef: MutableRefObject<LexicalEditor | null>;
  onCurrentBlockIdChange: (blockId: string | null) => void;
  onBlurSave: () => void;
  currentManuscriptBlockId: string | null;
  manuscriptExcerptByBlockId: Record<string, string>;
  onGoToLinkedManuscript: () => void;
  onToolbarStateChange: (state: MarginToolbarState) => void;
  onFocusChange?: (focused: boolean) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    props.editorRef.current = editor;
    return () => {
      props.editorRef.current = null;
    };
  }, [editor, props.editorRef]);

  useEffect(() => registerMarginaliaCommands(editor, props.kind), [editor, props.kind]);

  useEffect(() => {
    const syncToolbarState = () => {
      editor.getEditorState().read(() => {
        props.onToolbarStateChange(readMarginToolbarState());
      });
      syncLinkedPreviews(editor.getRootElement(), props.manuscriptExcerptByBlockId);
    };

    syncToolbarState();

    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(() => {
            const block = $getCurrentMarginaliaBlockNode();
            props.onCurrentBlockIdChange(block?.getMarginBlockId() ?? null);
            props.onToolbarStateChange(readMarginToolbarState());
          });
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const isMainModifier = event.metaKey || event.ctrlKey;
          if (!isMainModifier || !event.altKey) {
            return false;
          }

          const key = event.key.toLowerCase();
          if (key === "n") {
            event.preventDefault();
            editor.dispatchCommand(INSERT_MARGINALIA_BLOCK_COMMAND, {
              kind: props.kind,
              linkedManuscriptBlockId: props.currentManuscriptBlockId,
            });
            return true;
          }
          if (key === "l" && props.currentManuscriptBlockId) {
            event.preventDefault();
            editor.dispatchCommand(LINK_CURRENT_MARGINALIA_BLOCK_COMMAND, {
              manuscriptBlockId: props.currentManuscriptBlockId,
            });
            return true;
          }
          if (key === "u") {
            event.preventDefault();
            editor.dispatchCommand(UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
            return true;
          }
          if (key === "g") {
            event.preventDefault();
            props.onGoToLinkedManuscript();
            return true;
          }
          if (key === "d") {
            event.preventDefault();
            editor.dispatchCommand(DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
            return true;
          }
          if (key === "s") {
            event.preventDefault();
            editor.dispatchCommand(SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
            return true;
          }
          if (key === "x") {
            event.preventDefault();
            editor.dispatchCommand(DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
            return true;
          }
          if (event.shiftKey && event.key === "ArrowUp") {
            event.preventDefault();
            editor.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND, undefined);
            return true;
          }
          if (event.shiftKey && event.key === "ArrowDown") {
            event.preventDefault();
            editor.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND, undefined);
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            editor.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND, undefined);
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            editor.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND, undefined);
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(() => {
        syncToolbarState();
      }),
      editor.registerRootListener((rootElement, prevRootElement) => {
        const onBlur = () => props.onBlurSave();
        const onFocusIn = () => props.onFocusChange?.(true);
        const onFocusOut = () => {
          window.setTimeout(() => {
            const root = editor.getRootElement();
            const activeElement = document.activeElement;
            props.onFocusChange?.(Boolean(root && activeElement instanceof Node && root.contains(activeElement)));
          }, 0);
        };
        if (prevRootElement) {
          prevRootElement.removeEventListener("blur", onBlur, true);
          prevRootElement.removeEventListener("focusin", onFocusIn);
          prevRootElement.removeEventListener("focusout", onFocusOut);
        }
        if (rootElement) {
          rootElement.addEventListener("blur", onBlur, true);
          rootElement.addEventListener("focusin", onFocusIn);
          rootElement.addEventListener("focusout", onFocusOut);
        }
      }),
    );
  }, [editor, props]);

  return null;
}

function MarginDragAndDropPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const pointerDragRef = useRef<DragState | null>(null);
  const keyboardGrabbedBlockIdRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearVisualState = () => {
      const rootElement = rootRef.current;
      if (!rootElement) {
        return;
      }

      clearDropIndicators(rootElement);
      updateGrabbedHandleState(rootElement, keyboardGrabbedBlockIdRef.current);
      delete rootElement.dataset.dragging;
    };

    const moveBlockToDropTarget = (
      sourceMarginBlockId: string,
      targetMarginBlockId: string,
      position: DropPosition,
    ): boolean => {
      let moved = false;

      editor.update(() => {
        const source = $findMarginaliaBlockById(sourceMarginBlockId);
        const target = $findMarginaliaBlockById(targetMarginBlockId);
        if (!source || !target || source.is(target)) {
          return;
        }

        if (position === "before") {
          target.insertBefore(source);
        } else {
          target.insertAfter(source);
        }

        source.selectStart();
        moved = true;
      });

      return moved;
    };

    const moveBlockWithKeyboard = (marginBlockId: string, direction: "up" | "down"): boolean => {
      let moved = false;

      editor.update(() => {
        const block = $findMarginaliaBlockById(marginBlockId);
        if (!block) {
          return;
        }

        if (direction === "up") {
          const previous = block.getPreviousSibling();
          if (!$isMarginaliaBlockNode(previous)) {
            return;
          }
          previous.insertBefore(block);
        } else {
          const next = block.getNextSibling();
          if (!$isMarginaliaBlockNode(next)) {
            return;
          }
          next.insertAfter(block);
        }

        block.selectStart();
        moved = true;
      });

      return moved;
    };

    const unlockGlobalDragStyles = (dragState: DragState) => {
      document.body.style.userSelect = dragState.previousBodyUserSelect;
      document.body.style.cursor = dragState.previousBodyCursor;
    };

    const lockGlobalDragStyles = () => {
      const previousBodyUserSelect = document.body.style.userSelect;
      const previousBodyCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      return { previousBodyUserSelect, previousBodyCursor };
    };

    const clearCurrentDropIndicator = (dragState: DragState) => {
      if (dragState.targetElement) {
        delete dragState.targetElement.dataset.dropPosition;
      }
      dragState.targetElement = null;
      dragState.targetMarginBlockId = null;
      dragState.dropPosition = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const dragState = pointerDragRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      if (!dragState.hasMoved) {
        const dx = Math.abs(event.clientX - dragState.startX);
        const dy = Math.abs(event.clientY - dragState.startY);
        if (dx < 3 && dy < 3) {
          return;
        }
        dragState.hasMoved = true;
      }

      const target = findDropTarget(dragState.candidates, event.clientY);
      if (!target) {
        clearCurrentDropIndicator(dragState);
        return;
      }

      if (
        dragState.targetMarginBlockId === target.marginBlockId &&
        dragState.dropPosition === target.position
      ) {
        return;
      }

      if (dragState.targetElement) {
        delete dragState.targetElement.dataset.dropPosition;
      }
      setDropIndicator(target.element, target.position);
      dragState.targetMarginBlockId = target.marginBlockId;
      dragState.dropPosition = target.position;
      dragState.targetElement = target.element;
    };

    const stopPointerDrag = (applyDrop: boolean, pointerId: number | null) => {
      const dragState = pointerDragRef.current;
      if (!dragState) {
        return;
      }
      if (pointerId != null && dragState.pointerId !== pointerId) {
        return;
      }

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
      dragState.sourceHandle.removeEventListener("lostpointercapture", onLostPointerCapture);

      if (dragState.sourceHandle.hasPointerCapture(dragState.pointerId)) {
        dragState.sourceHandle.releasePointerCapture(dragState.pointerId);
      }

      if (
        applyDrop &&
        dragState.hasMoved &&
        dragState.targetMarginBlockId &&
        dragState.dropPosition &&
        dragState.targetMarginBlockId !== dragState.sourceMarginBlockId
      ) {
        moveBlockToDropTarget(
          dragState.sourceMarginBlockId,
          dragState.targetMarginBlockId,
          dragState.dropPosition,
        );
      }

      unlockGlobalDragStyles(dragState);
      pointerDragRef.current = null;
      clearVisualState();
    };

    const onPointerUp = (event: PointerEvent) => {
      stopPointerDrag(true, event.pointerId);
    };

    const onPointerCancel = (event: PointerEvent) => {
      stopPointerDrag(false, event.pointerId);
    };

    const onWindowBlur = () => {
      stopPointerDrag(false, null);
    };

    const onLostPointerCapture = (event: PointerEvent) => {
      stopPointerDrag(false, event.pointerId);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointerDragRef.current) {
        return;
      }

      const rootElement = rootRef.current;
      if (!rootElement) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const handle = target.closest<HTMLElement>(MARGINALIA_HANDLE_SELECTOR);
      if (!handle || !rootElement.contains(handle)) {
        return;
      }

      const sourceMarginBlockId = handle.dataset.marginBlockId;
      if (!sourceMarginBlockId) {
        return;
      }

      event.preventDefault();
      keyboardGrabbedBlockIdRef.current = null;
      handle.focus();

      const dragCandidates = collectDragCandidates(rootElement, sourceMarginBlockId);
      const { previousBodyUserSelect, previousBodyCursor } = lockGlobalDragStyles();

      pointerDragRef.current = {
        pointerId: event.pointerId,
        sourceMarginBlockId,
        sourceHandle: handle,
        startX: event.clientX,
        startY: event.clientY,
        hasMoved: false,
        candidates: dragCandidates,
        targetMarginBlockId: null,
        targetElement: null,
        dropPosition: null,
        previousBodyUserSelect,
        previousBodyCursor,
      };

      rootElement.dataset.dragging = "true";
      updateGrabbedHandleState(rootElement, sourceMarginBlockId);

      handle.setPointerCapture(event.pointerId);
      handle.addEventListener("lostpointercapture", onLostPointerCapture);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("blur", onWindowBlur);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const rootElement = rootRef.current;
      if (!rootElement) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const handle = target.closest<HTMLElement>(MARGINALIA_HANDLE_SELECTOR);
      if (!handle || !rootElement.contains(handle)) {
        return;
      }

      const marginBlockId = handle.dataset.marginBlockId;
      if (!marginBlockId) {
        return;
      }

      const key = event.key;
      const isGrabToggle = key === "Enter" || key === " " || event.code === "Space";
      const currentlyGrabbed = keyboardGrabbedBlockIdRef.current === marginBlockId;

      if (isGrabToggle) {
        event.preventDefault();
        keyboardGrabbedBlockIdRef.current = currentlyGrabbed ? null : marginBlockId;
        updateGrabbedHandleState(rootElement, keyboardGrabbedBlockIdRef.current);
        return;
      }

      if (key === "Escape" && currentlyGrabbed) {
        event.preventDefault();
        keyboardGrabbedBlockIdRef.current = null;
        updateGrabbedHandleState(rootElement, null);
        return;
      }

      if (!currentlyGrabbed) {
        return;
      }

      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const moved = moveBlockWithKeyboard(marginBlockId, key === "ArrowUp" ? "up" : "down");
        if (moved) {
          requestAnimationFrame(() => {
            const nextHandle = rootRef.current?.querySelector<HTMLElement>(
              `${MARGINALIA_HANDLE_SELECTOR}[data-margin-block-id="${marginBlockId}"]`,
            );
            nextHandle?.focus();
            updateGrabbedHandleState(rootElement, marginBlockId);
          });
        }
      }
    };

    const unregister = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener("pointerdown", onPointerDown);
        prevRootElement.removeEventListener("keydown", onKeyDown);
      }

      rootRef.current = rootElement;
      if (rootElement) {
        rootElement.addEventListener("pointerdown", onPointerDown);
        rootElement.addEventListener("keydown", onKeyDown);
        clearDropIndicators(rootElement);
        updateGrabbedHandleState(rootElement, keyboardGrabbedBlockIdRef.current);
      }
    });

    return () => {
      stopPointerDrag(false, null);
      const rootElement = rootRef.current;
      if (rootElement) {
        rootElement.removeEventListener("pointerdown", onPointerDown);
        rootElement.removeEventListener("keydown", onKeyDown);
      }
      rootRef.current = null;
      unregister();
    };
  }, [editor]);

  return null;
}

function MarginToolbar(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  kind: MarginKind;
  currentManuscriptBlockId: string | null;
  toolbarState: MarginToolbarState;
  onInsertLinkedBlock: () => void;
  onGoToLinkedManuscript: () => void;
}) {
  const run = (callback: (editor: LexicalEditor) => void) => {
    const editor = props.editorRef.current;
    if (!editor) {
      return;
    }
    callback(editor);
  };

  const setBlockType = (type: "paragraph" | "h1" | "h2" | "h3" | "quote") => {
    run((editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        if (type === "paragraph") {
          $setBlocksType(selection, () => $createParagraphNode());
          return;
        }

        if (type === "quote") {
          $setBlocksType(selection, () => $createQuoteNode());
          return;
        }

        $setBlocksType(selection, () => $createHeadingNode(type));
      });
    });
  };

  return (
    <>
      <div className="editor-toolbar editor-toolbar-margin">
        <span className="editor-toolbar-label">Notes</span>
        <div className="toolbar-inline-group">
          <button
            className="toolbar-button toolbar-button-prominent"
            type="button"
            onClick={() =>
              run((editor) =>
                editor.dispatchCommand(INSERT_MARGINALIA_BLOCK_COMMAND, {
                  kind: props.kind,
                  linkedManuscriptBlockId: null,
                }),
              )
            }
          >
            New Note
          </button>
          <button
            className="toolbar-button toolbar-button-prominent"
            type="button"
            onClick={props.onInsertLinkedBlock}
            disabled={!props.currentManuscriptBlockId}
          >
            New Linked Note
          </button>
        </div>
        <div className="toolbar-inline-group">
          <button
            className="toolbar-button toolbar-button-compact"
            type="button"
            onClick={() =>
              run((editor) =>
                editor.dispatchCommand(LINK_CURRENT_MARGINALIA_BLOCK_COMMAND, {
                  manuscriptBlockId: props.currentManuscriptBlockId,
                }),
              )
            }
            disabled={!props.currentManuscriptBlockId}
          >
            Link to Passage
          </button>
          <button className="toolbar-button toolbar-button-compact" type="button" onClick={props.onGoToLinkedManuscript}>
            Go to Passage
          </button>
        </div>
        <details className="editor-advanced-tools">
          <summary>Format</summary>
          <div className="editor-advanced-tools-body">
            <button
              className="toolbar-button"
              data-active={props.toolbarState.bold ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
            >
              Bold
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.italic ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}
            >
              Italic
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.underline ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"))}
            >
              Underline
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "paragraph" ? "true" : "false"}
              type="button"
              onClick={() => setBlockType("paragraph")}
            >
              Text
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "h1" ? "true" : "false"}
              type="button"
              onClick={() => setBlockType("h1")}
            >
              H1
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "h2" ? "true" : "false"}
              type="button"
              onClick={() => setBlockType("h2")}
            >
              H2
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "h3" ? "true" : "false"}
              type="button"
              onClick={() => setBlockType("h3")}
            >
              H3
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "quote" ? "true" : "false"}
              type="button"
              onClick={() => setBlockType("quote")}
            >
              Quote
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "bullets" ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined))}
            >
              Bullets
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "numbers" ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined))}
            >
              Numbers
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "checklist" ? "true" : "false"}
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined))}
            >
              Checklist
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined))}
            >
              No List
            </button>
          </div>
        </details>
        <details className="editor-advanced-tools">
          <summary>Note tools</summary>
          <div className="editor-advanced-tools-body">
            <button
              className="toolbar-button toolbar-button-compact"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined))}
            >
              Remove Link
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined))}
            >
              Split
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND, undefined))}
            >
              Merge with Above
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND, undefined))}
            >
              Merge with Below
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined))}
            >
              Duplicate Note
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND, undefined))}
            >
              Move Earlier
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND, undefined))}
            >
              Move Later
            </button>
            <button
              className="toolbar-button destructive-button"
              type="button"
              onClick={() => run((editor) => editor.dispatchCommand(DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined))}
            >
              Delete Note
            </button>
          </div>
        </details>
      </div>
      <div className="margin-writing-status">
        <div className="editor-context-group">
          <span
            className={`margin-status-chip ${
              props.toolbarState.linkedManuscriptBlockId ? "is-linked" : "is-unlinked"
            }`}
          >
            {props.toolbarState.linkedManuscriptBlockId ? "Linked note" : "Free note"}
          </span>
          <span className={`margin-status-chip ${props.currentManuscriptBlockId ? "is-targeting" : ""}`}>
            {props.currentManuscriptBlockId ? "Passage ready" : "Select a passage"}
          </span>
        </div>
        <details className="context-help">
          <summary>Note shortcuts</summary>
          <div className="context-help-body">
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+N create linked note</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+L link current note</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+G jump to passage</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+D duplicate note</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+S split note</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+Shift+Up merge upward</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+Shift+Down merge downward</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+X delete note</span>
          </div>
        </details>
      </div>
    </>
  );
}

export const MarginEditorBase = forwardRef<MarginEditorHandle, MarginEditorBaseProps>(function MarginEditorBaseComponent(
  props,
  ref,
) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const currentManuscriptBlockId = useAppStore((state) => state.currentManuscriptBlockId);
  const [toolbarState, setToolbarState] = useState<MarginToolbarState>(DEFAULT_MARGIN_TOOLBAR_STATE);

  const autosave = useMemo(() => debounce((json: string) => props.onAutosave(json), 700), [props]);
  const linkIndexSave = useMemo(
    () =>
      debounce((json: string) => {
        props.onLinkIndexChange(buildMarginLinkIndexFromLexicalJson(json));
      }, 350),
    [props],
  );

  useEffect(() => {
    return () => {
      autosave.flush();
      linkIndexSave.flush();
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }
    };
  }, [autosave, linkIndexSave]);

  useEffect(() => {
    syncLinkedPreviews(editorRef.current?.getRootElement() ?? null, props.manuscriptExcerptByBlockId);
  }, [props.manuscriptExcerptByBlockId]);

  const insertBlock = (linkedManuscriptBlockId: string | null) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.dispatchCommand(INSERT_MARGINALIA_BLOCK_COMMAND, {
      kind: props.kind,
      linkedManuscriptBlockId,
    });
    editor.focus();
  };

  const focusBlockById = (marginBlockId: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.update(() => {
      const block = $findMarginaliaBlockById(marginBlockId);
      if (block) {
        block.selectStart();
      }
    });

    const rootElement = editor.getRootElement();
    const candidates = rootElement?.querySelectorAll<HTMLElement>("[data-margin-block-id]");
    const target = [...(candidates ?? [])].find((element) => element.dataset.marginBlockId === marginBlockId);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goToLinkedManuscript = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    let linked: string | null = null;
    editor.getEditorState().read(() => {
      linked = $getCurrentMarginaliaBlockNode()?.getLinkedManuscriptBlockId() ?? null;
    });

    if (linked) {
      props.onNavigateToManuscriptBlock(linked);
    }
  };

  const revealForManuscriptBlock = (manuscriptBlockId: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      return;
    }

    const linked = [...rootElement.querySelectorAll<HTMLElement>("[data-linked-manuscript-block-id]")].filter(
      (element) => element.dataset.linkedManuscriptBlockId === manuscriptBlockId,
    );

    if (linked.length === 0) {
      return;
    }

    for (const element of linked) {
      element.dataset.linkedTarget = "true";
    }
    linked[0].scrollIntoView({ behavior: "smooth", block: "center" });

    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      for (const element of linked) {
        delete element.dataset.linkedTarget;
      }
      revealTimeoutRef.current = null;
    }, 1600);
  };

  useImperativeHandle(
    ref,
    () => ({
      insertBlock,
      revealForManuscriptBlock,
      focusBlockById,
      focusEditor: () => editorRef.current?.focus(),
      getLexicalJson: () => {
        const editor = editorRef.current;
        if (!editor) {
          return props.initialStateJson;
        }
        return JSON.stringify(editor.getEditorState().toJSON());
      },
      linkCurrentToManuscript: (manuscriptBlockId) => {
        editorRef.current?.dispatchCommand(LINK_CURRENT_MARGINALIA_BLOCK_COMMAND, { manuscriptBlockId });
      },
      unlinkCurrent: () => {
        editorRef.current?.dispatchCommand(UNLINK_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
      },
      moveCurrentUp: () => {
        editorRef.current?.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_UP_COMMAND, undefined);
      },
      moveCurrentDown: () => {
        editorRef.current?.dispatchCommand(MOVE_CURRENT_MARGINALIA_BLOCK_DOWN_COMMAND, undefined);
      },
      duplicateCurrent: () => {
        editorRef.current?.dispatchCommand(DUPLICATE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
      },
      splitCurrent: () => {
        editorRef.current?.dispatchCommand(SPLIT_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
      },
      mergeCurrentUp: () => {
        editorRef.current?.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_PREVIOUS_COMMAND, undefined);
      },
      mergeCurrentDown: () => {
        editorRef.current?.dispatchCommand(MERGE_CURRENT_MARGINALIA_BLOCK_WITH_NEXT_COMMAND, undefined);
      },
      deleteCurrent: () => {
        editorRef.current?.dispatchCommand(DELETE_CURRENT_MARGINALIA_BLOCK_COMMAND, undefined);
      },
      goToLinkedManuscript,
    }),
    [props.initialStateJson, props.kind],
  );

  const initialConfig = useMemo(
    () => ({
      namespace: `marginalia-${props.kind}`,
      theme: MARGIN_THEME,
      onError(error: Error) {
        throw error;
      },
      nodes: [MarginaliaBlockNode, HeadingNode, QuoteNode, ListNode, ListItemNode],
      editorState: props.initialStateJson,
    }),
    [props.initialStateJson, props.kind],
  );

  return (
    <div className="editor-shell editor-shell-margin">
      <div className="margin-header">
        <div className="margin-heading">
          <span className="margin-title">{props.title}</span>
          <span className="margin-subtitle">{props.subtitle}</span>
        </div>
        <button className="toolbar-button margin-create-button" type="button" onClick={() => insertBlock(null)}>
          +
        </button>
      </div>
      <LexicalComposer initialConfig={initialConfig}>
        <MarginToolbar
          editorRef={editorRef}
          kind={props.kind}
          currentManuscriptBlockId={currentManuscriptBlockId}
          toolbarState={toolbarState}
          onInsertLinkedBlock={() => insertBlock(currentManuscriptBlockId)}
          onGoToLinkedManuscript={goToLinkedManuscript}
        />
        <div className="lexical-scroll margin-scroll">
          <div className="editor-content-wrap margin-editor-content">
            <RichTextPlugin
              contentEditable={<ContentEditable className="lexical-editor" aria-label={`${props.title} editor`} />}
              placeholder={<div className="lexical-placeholder margin-placeholder">Write in the margin...</div>}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <OnChangePlugin
          ignoreSelectionChange
          onChange={(editorState) => {
            const json = JSON.stringify(editorState.toJSON());
            autosave(json);
            linkIndexSave(json);
          }}
        />
        <EnsureInitialBlockPlugin kind={props.kind} />
        <MarginBridgePlugin
          kind={props.kind}
          editorRef={editorRef}
          onCurrentBlockIdChange={props.onCurrentBlockIdChange}
          currentManuscriptBlockId={currentManuscriptBlockId}
          manuscriptExcerptByBlockId={props.manuscriptExcerptByBlockId}
          onGoToLinkedManuscript={goToLinkedManuscript}
          onToolbarStateChange={setToolbarState}
          onFocusChange={props.onFocusChange}
          onBlurSave={() => {
            const editor = editorRef.current;
            if (!editor) {
              return;
            }
            autosave.cancel();
            linkIndexSave.cancel();
            const json = JSON.stringify(editor.getEditorState().toJSON());
            props.onAutosave(json);
            props.onLinkIndexChange(buildMarginLinkIndexFromLexicalJson(json));
          }}
        />
        <MarginDragAndDropPlugin />
      </LexicalComposer>
    </div>
  );
});
