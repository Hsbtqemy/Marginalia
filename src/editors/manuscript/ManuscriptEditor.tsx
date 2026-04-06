import {
  useCallback,
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
import { $generateHtmlFromNodes } from "@lexical/html";
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
} from "@lexical/rich-text";
import {
  ListItemNode,
  ListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { debounce } from "../../utils/debounce";
import { useAppStore } from "../../state/useAppStore";
import { BlockIdPlugin } from "./lexicalBlocks/BlockIdPlugin";
import { buildManuscriptExcerptIndexFromSerializedLexicalState } from "./lexicalBlocks/indexing";
import {
  collectManuscriptBlockIds,
  deleteCurrentManuscriptBlock,
  duplicateCurrentManuscriptBlock,
  findManuscriptBlockNodeById,
  getCurrentSelectionBlockId,
  getSelectionBlockNode,
  ensureCurrentSelectionBlockId as ensureCurrentSelectionBlockIdInEditor,
  insertManuscriptBlockAfterCurrent,
  insertManuscriptBlockBeforeCurrent,
  insertLinkedPassageAfterSelection,
  moveCurrentManuscriptBlockDown,
  moveCurrentManuscriptBlockUp,
} from "./lexicalBlocks/manuscriptBlockUtils";

const MANUSCRIPT_THEME = {
  paragraph: "",
  quote: "",
  heading: {
    h1: "",
    h2: "",
    h3: "",
  },
  text: {
    bold: "",
    italic: "",
    underline: "",
  },
};

export interface ManuscriptEditorHandle {
  focusBlockById: (blockId: string) => void;
  focusEditor: () => void;
  getHtml: () => string;
  getLexicalJson: () => string;
  listBlockIds: () => string[];
  ensureCurrentSelectionBlockId: () => string | null;
  createLinkedPassageBlock: () => string | null;
  insertBlockBefore: (blockId?: string | null) => string | null;
  insertBlockAfter: (blockId?: string | null) => string | null;
  duplicateBlock: (blockId?: string | null) => string | null;
  moveBlockUp: (blockId?: string | null) => string | null;
  moveBlockDown: (blockId?: string | null) => string | null;
  deleteBlock: (blockId?: string | null) => string | null;
}

interface ManuscriptEditorProps {
  initialStateJson: string;
  unitCount: number;
  pagePreview: boolean;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (blockId: string | null) => void;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
  onInsertUnitBefore: () => void;
  onInsertUnitAfter: () => void;
  onInsertUnitBeforeBlock: (blockId: string) => void;
  onInsertUnitAfterBlock: (blockId: string) => void;
  onInsertUnitAtStart: () => void;
  onQuickInsertUnit: () => void;
  onDuplicateUnit: () => void;
  onMoveUnitUp: () => void;
  onMoveUnitDown: () => void;
  onDeleteUnit: () => void;
  onExcerptIndexChange: (excerptByBlockId: Record<string, string>) => void;
  onFocusChange?: (focused: boolean) => void;
}

type ManuscriptBlockType = "paragraph" | "h1" | "h2" | "h3" | "quote" | "bullets" | "numbers";

interface ManuscriptToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  blockType: ManuscriptBlockType;
}

const DEFAULT_MANUSCRIPT_TOOLBAR_STATE: ManuscriptToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  blockType: "paragraph",
};

function manuscriptToolbarStateEquals(a: ManuscriptToolbarState, b: ManuscriptToolbarState): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.blockType === b.blockType
  );
}

function excerptIndexEquals(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

function applyManuscriptBlockType(editor: LexicalEditor, type: "paragraph" | "h1" | "h2" | "h3" | "quote"): void {
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
}

function readManuscriptToolbarState(): ManuscriptToolbarState {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return DEFAULT_MANUSCRIPT_TOOLBAR_STATE;
  }

  const nextState: ManuscriptToolbarState = {
    bold: selection.hasFormat("bold"),
    italic: selection.hasFormat("italic"),
    underline: selection.hasFormat("underline"),
    blockType: "paragraph",
  };

  const block = getSelectionBlockNode(selection);
  if (block instanceof HeadingNode) {
    const tag = block.getTag();
    nextState.blockType = tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph";
    return nextState;
  }
  if (block instanceof QuoteNode) {
    nextState.blockType = "quote";
    return nextState;
  }
  if (block instanceof ListItemNode) {
    const list = block.getParent();
    if (list instanceof ListNode) {
      nextState.blockType = list.getListType() === "number" ? "numbers" : "bullets";
    }
  }

  return nextState;
}

function EditorBridgePlugin(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
  onQuickInsertUnit: () => void;
  onMoveUnitUp: () => void;
  onMoveUnitDown: () => void;
  onUnitCountChange: (count: number) => void;
  onExcerptIndexChange: (excerptByBlockId: Record<string, string>) => void;
  onToolbarStateChange: (state: ManuscriptToolbarState) => void;
  onBlurSave: () => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const lastExcerptIndexRef = useRef<Record<string, string> | null>(null);
  const callbacksRef = useRef({
    onCreateLinkedMarginalia: props.onCreateLinkedMarginalia,
    onRevealMarginalia: props.onRevealMarginalia,
    onQuickInsertUnit: props.onQuickInsertUnit,
    onMoveUnitUp: props.onMoveUnitUp,
    onMoveUnitDown: props.onMoveUnitDown,
    onUnitCountChange: props.onUnitCountChange,
    onExcerptIndexChange: props.onExcerptIndexChange,
    onToolbarStateChange: props.onToolbarStateChange,
    onBlurSave: props.onBlurSave,
  });

  useEffect(() => {
    callbacksRef.current = {
      onCreateLinkedMarginalia: props.onCreateLinkedMarginalia,
      onRevealMarginalia: props.onRevealMarginalia,
      onQuickInsertUnit: props.onQuickInsertUnit,
      onMoveUnitUp: props.onMoveUnitUp,
      onMoveUnitDown: props.onMoveUnitDown,
      onUnitCountChange: props.onUnitCountChange,
      onExcerptIndexChange: props.onExcerptIndexChange,
      onToolbarStateChange: props.onToolbarStateChange,
      onBlurSave: props.onBlurSave,
    };
  }, [
    props.onCreateLinkedMarginalia,
    props.onRevealMarginalia,
    props.onQuickInsertUnit,
    props.onMoveUnitUp,
    props.onMoveUnitDown,
    props.onUnitCountChange,
    props.onExcerptIndexChange,
    props.onToolbarStateChange,
    props.onBlurSave,
  ]);

  useEffect(() => {
    props.editorRef.current = editor;
    return () => {
      props.editorRef.current = null;
    };
  }, [editor, props.editorRef]);

  useEffect(() => {
    const syncEditorBridgeState = (editorState = editor.getEditorState(), syncExcerptIndex = true) => {
      editorState.read(() => {
        callbacksRef.current.onUnitCountChange(collectManuscriptBlockIds().length);
        callbacksRef.current.onToolbarStateChange(readManuscriptToolbarState());
      });
      if (syncExcerptIndex) {
        const nextExcerptIndex = buildManuscriptExcerptIndexFromSerializedLexicalState(editorState.toJSON());
        if (
          lastExcerptIndexRef.current == null ||
          !excerptIndexEquals(lastExcerptIndexRef.current, nextExcerptIndex)
        ) {
          lastExcerptIndexRef.current = nextExcerptIndex;
          callbacksRef.current.onExcerptIndexChange(nextExcerptIndex);
        }
      }
    };

    syncEditorBridgeState();

    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const isMainModifier = event.metaKey || event.ctrlKey;
          if (!isMainModifier || !event.altKey) {
            return false;
          }

          const lowerKey = event.key.toLowerCase();
          if (lowerKey === "n") {
            event.preventDefault();
            editor.getEditorState().read(() => {
              callbacksRef.current.onCreateLinkedMarginalia(getCurrentSelectionBlockId());
            });
            return true;
          }
          if (lowerKey === "g") {
            event.preventDefault();
            editor.getEditorState().read(() => {
              callbacksRef.current.onRevealMarginalia(getCurrentSelectionBlockId());
            });
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            callbacksRef.current.onQuickInsertUnit();
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            callbacksRef.current.onMoveUnitUp();
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            callbacksRef.current.onMoveUnitDown();
            return true;
          }
          if (event.key === "1" || event.key === "2" || event.key === "3") {
            event.preventDefault();
            applyManuscriptBlockType(editor, `h${event.key}` as "h1" | "h2" | "h3");
            return true;
          }
          if (event.key === "0") {
            event.preventDefault();
            applyManuscriptBlockType(editor, "paragraph");
            return true;
          }
          if (lowerKey === "q") {
            event.preventDefault();
            applyManuscriptBlockType(editor, "quote");
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        const hasContentChanges = dirtyElements.size > 0 || dirtyLeaves.size > 0;
        syncEditorBridgeState(editorState, hasContentChanges);
      }),
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      const handleBlur = () => callbacksRef.current.onBlurSave();
      if (prevRootElement) {
        prevRootElement.removeEventListener("blur", handleBlur, true);
      }
      if (rootElement) {
        rootElement.addEventListener("blur", handleBlur, true);
      }
    });
  }, [editor]);

  return null;
}

interface UnitInsertionPoint {
  key: string;
  top: number;
  anchorBlockId: string;
  position: "before" | "after";
  label: string;
}

function UnitInsertionOverlayPlugin(props: {
  hostRef: MutableRefObject<HTMLDivElement | null>;
  onInsertUnitBeforeBlock: (blockId: string) => void;
  onInsertUnitAfterBlock: (blockId: string) => void;
  onInsertUnitAtStart: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [insertionPoints, setInsertionPoints] = useState<UnitInsertionPoint[]>([]);
  const [isEmptyDocument, setIsEmptyDocument] = useState(false);

  useEffect(() => {
    let frameHandle = 0;
    let resizeObserver: ResizeObserver | null =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleMeasurement();
          });

    const measureInsertionPoints = () => {
      const root = editor.getRootElement();
      const host = props.hostRef.current;
      if (!root || !host) {
        setInsertionPoints([]);
        setIsEmptyDocument(false);
        return;
      }

      const blockElements = Array.from(
        root.querySelectorAll<HTMLElement>("[data-manuscript-block-id]"),
      ).filter((element) => (element.dataset.manuscriptBlockId ?? "").length > 0);

      if (blockElements.length === 0) {
        setInsertionPoints([]);
        setIsEmptyDocument(true);
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const nextInsertionPoints: UnitInsertionPoint[] = [];

      for (let index = 0; index < blockElements.length; index += 1) {
        const blockElement = blockElements[index];
        const blockId = blockElement.dataset.manuscriptBlockId ?? "";
        const blockRect = blockElement.getBoundingClientRect();

        if (index === 0) {
          nextInsertionPoints.push({
            key: `before-${blockId}`,
            top: Math.max(blockRect.top - hostRect.top - 18, 18),
            anchorBlockId: blockId,
            position: "before",
            label: "Insert a unit before this one",
          });
        }

        if (index < blockElements.length - 1) {
          const nextBlockRect = blockElements[index + 1].getBoundingClientRect();
          nextInsertionPoints.push({
            key: `after-${blockId}`,
            top: ((blockRect.bottom + nextBlockRect.top) / 2) - hostRect.top,
            anchorBlockId: blockId,
            position: "after",
            label: "Insert a unit between these two units",
          });
        } else {
          nextInsertionPoints.push({
            key: `after-${blockId}-end`,
            top: blockRect.bottom - hostRect.top + 18,
            anchorBlockId: blockId,
            position: "after",
            label: "Insert a unit after this one",
          });
        }
      }

      setInsertionPoints(nextInsertionPoints);
      setIsEmptyDocument(false);
    };

    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(frameHandle);
      frameHandle = window.requestAnimationFrame(measureInsertionPoints);
    };

    const observeInsertionLayout = (rootElement: HTMLElement | null) => {
      if (!resizeObserver) {
        return;
      }

      resizeObserver.disconnect();

      const host = props.hostRef.current;
      if (host) {
        resizeObserver.observe(host);
      }
      if (rootElement) {
        resizeObserver.observe(rootElement);
      }
    };

    scheduleMeasurement();
    observeInsertionLayout(editor.getRootElement());

    const unregister = mergeRegister(
      editor.registerUpdateListener(() => {
        scheduleMeasurement();
      }),
      editor.registerRootListener((rootElement) => {
        observeInsertionLayout(rootElement);
        scheduleMeasurement();
      }),
    );

    window.addEventListener("resize", scheduleMeasurement);

    return () => {
      window.cancelAnimationFrame(frameHandle);
      unregister();
      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [editor, props.hostRef]);

  return (
    <>
      {isEmptyDocument ? (
        <div className="manuscript-empty-unit-cta">
          <span className="manuscript-empty-unit-kicker">Compose by units</span>
          <strong className="manuscript-empty-unit-title">Start the draft with a first unit.</strong>
          <p className="manuscript-empty-unit-copy">
            Each unit begins with a passage. Add a scholie when you need commentary, then keep
            building the sequence between existing units.
          </p>
          <button
            className="toolbar-button toolbar-button-prominent manuscript-empty-unit-button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onInsertUnitAtStart}
          >
            Start First Unit
          </button>
          <span className="manuscript-empty-unit-shortcut">Quick insert: Ctrl/Cmd+Alt+Enter</span>
        </div>
      ) : null}
      {insertionPoints.length > 0 ? (
        <div className="manuscript-unit-insertion-overlay">
          {insertionPoints.map((insertionPoint) => (
            <div
              key={insertionPoint.key}
              className="manuscript-unit-insertion-slot"
              style={{ top: `${insertionPoint.top}px` }}
            >
              <button
                className="manuscript-unit-insertion-button"
                type="button"
                aria-label={insertionPoint.label}
                title={insertionPoint.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (insertionPoint.position === "before") {
                    props.onInsertUnitBeforeBlock(insertionPoint.anchorBlockId);
                    return;
                  }

                  props.onInsertUnitAfterBlock(insertionPoint.anchorBlockId);
                }}
              >
                +
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ManuscriptToolbar(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  toolbarState: ManuscriptToolbarState;
  unitCount: number;
  isFocused: boolean;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onInsertUnitBefore: () => void;
  onInsertUnitAfter: () => void;
  onDuplicateUnit: () => void;
  onMoveUnitUp: () => void;
  onMoveUnitDown: () => void;
  onDeleteUnit: () => void;
}) {
  const currentManuscriptBlockId = useAppStore((state) => state.currentManuscriptBlockId);
  const leftLinksByManuscriptBlockId = useAppStore((state) => state.leftLinksByManuscriptBlockId);
  const rightLinksByManuscriptBlockId = useAppStore((state) => state.rightLinksByManuscriptBlockId);

  const runInEditor = (callback: (editor: LexicalEditor) => void) => {
    const editor = props.editorRef.current;
    if (!editor) {
      return;
    }
    callback(editor);
  };

  const setBlockType = (type: "paragraph" | "h1" | "h2" | "h3" | "quote") => {
    runInEditor((editor) => applyManuscriptBlockType(editor, type));
  };

  const linkedLeftCount = currentManuscriptBlockId ? (leftLinksByManuscriptBlockId[currentManuscriptBlockId]?.length ?? 0) : 0;
  const linkedRightCount = currentManuscriptBlockId ? (rightLinksByManuscriptBlockId[currentManuscriptBlockId]?.length ?? 0) : 0;
  const hasLinkedNotes = linkedLeftCount + linkedRightCount > 0;
  const manuscriptBlockActionsDisabled = !currentManuscriptBlockId;
  const linkedNoteSummaryParts: string[] = [];
  if (linkedLeftCount > 0) {
    linkedNoteSummaryParts.push(`${linkedLeftCount} scholie${linkedLeftCount === 1 ? "" : "s"}`);
  }
  if (linkedRightCount > 0) {
    linkedNoteSummaryParts.push(`${linkedRightCount} source${linkedRightCount === 1 ? "" : "s"}`);
  }
  const draftStatus =
    props.unitCount === 0
      ? "No units yet"
      : props.unitCount === 1
        ? "1 unit in draft"
        : `${props.unitCount} units in draft`;
  const primaryStatus = props.isFocused
    ? currentManuscriptBlockId
      ? "Current unit"
      : props.unitCount === 0
        ? "Start the first unit"
        : "Choose a unit to continue"
    : null;
  const secondaryStatus = currentManuscriptBlockId
    ? hasLinkedNotes
      ? `${linkedNoteSummaryParts.join(", ")} linked to this unit`
      : props.isFocused
        ? "This unit can stay text-only or receive a scholie later"
        : null
    : null;
  const showContextGroup = props.unitCount > 0 || primaryStatus != null || secondaryStatus != null;

  return (
    <>
      <div className="editor-toolbar editor-toolbar-manuscript">
        <span className="editor-toolbar-label">Draft</span>
        <div className="toolbar-inline-group toolbar-inline-group-primary">
          <button
            className="toolbar-button toolbar-button-prominent"
            type="button"
            onClick={() => props.onCreateLinkedMarginalia(currentManuscriptBlockId)}
          >
            Add Scholie
          </button>
          <button
            className="toolbar-button toolbar-button-compact"
            type="button"
            disabled={!currentManuscriptBlockId}
            onClick={() => props.onRevealMarginalia(currentManuscriptBlockId)}
          >
            Reveal Scholies
          </button>
        </div>
        <div className="toolbar-inline-group">
          <button
            className="toolbar-button toolbar-button-compact"
            type="button"
            disabled={manuscriptBlockActionsDisabled}
            onClick={props.onInsertUnitBefore}
          >
            New Unit Before
          </button>
          <button
            className="toolbar-button toolbar-button-compact"
            type="button"
            disabled={manuscriptBlockActionsDisabled}
            onClick={props.onInsertUnitAfter}
          >
            New Unit After
          </button>
        </div>
        <details className="editor-advanced-tools">
          <summary>Unit</summary>
          <div className="editor-advanced-tools-body">
            <button
              className="toolbar-button"
              type="button"
              disabled={manuscriptBlockActionsDisabled}
              onClick={props.onDuplicateUnit}
            >
              Duplicate Unit
            </button>
            <button
              className="toolbar-button"
              type="button"
              disabled={manuscriptBlockActionsDisabled}
              onClick={props.onMoveUnitUp}
            >
              Move Earlier
            </button>
            <button
              className="toolbar-button"
              type="button"
              disabled={manuscriptBlockActionsDisabled}
              onClick={props.onMoveUnitDown}
            >
              Move Later
            </button>
            <button
              className="toolbar-button"
              type="button"
              disabled={manuscriptBlockActionsDisabled}
              onClick={props.onDeleteUnit}
            >
              Delete Unit
            </button>
          </div>
        </details>
        <details className="editor-advanced-tools">
          <summary>Format</summary>
          <div className="editor-advanced-tools-body">
            <button
              className="toolbar-button"
              data-active={props.toolbarState.bold ? "true" : "false"}
              type="button"
              onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
            >
              Bold
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.italic ? "true" : "false"}
              type="button"
              onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}
            >
              Italic
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.underline ? "true" : "false"}
              type="button"
              onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"))}
            >
              Underline
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
              onClick={() => runInEditor((editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined))}
            >
              Bullets
            </button>
            <button
              className="toolbar-button"
              data-active={props.toolbarState.blockType === "numbers" ? "true" : "false"}
              type="button"
              onClick={() => runInEditor((editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined))}
            >
              Numbers
            </button>
            <button className="toolbar-button" type="button" onClick={() => runInEditor((editor) => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined))}>
              No List
            </button>
          </div>
        </details>
      </div>
      <div className="margin-writing-status manuscript-context-row" data-focused={props.isFocused ? "true" : "false"}>
        {showContextGroup ? (
          <div className="editor-context-group">
            <span className="margin-status-chip">{draftStatus}</span>
            {primaryStatus ? (
              <span className={`margin-status-chip ${currentManuscriptBlockId ? "is-targeting" : ""}`}>
                {primaryStatus}
              </span>
            ) : null}
            {secondaryStatus ? <span className="margin-status-chip">{secondaryStatus}</span> : null}
          </div>
        ) : null}
        <details className="context-help">
          <summary>Shortcuts</summary>
          <div className="context-help-body">
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+Enter add the next unit</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+N add a scholie to the current unit</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+G reveal the current unit scholies</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+Up/Down reorder the current unit</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+1/2/3 headings, 0 paragraph</span>
          </div>
        </details>
      </div>
    </>
  );
}

export const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(
  function ManuscriptEditorComponent(props, ref) {
    const editorRef = useRef<LexicalEditor | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const contentWrapRef = useRef<HTMLDivElement | null>(null);
    const [toolbarState, setToolbarState] = useState<ManuscriptToolbarState>(DEFAULT_MANUSCRIPT_TOOLBAR_STATE);
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [liveUnitCount, setLiveUnitCount] = useState(props.unitCount);
    const currentManuscriptBlockId = useAppStore((state) => state.currentManuscriptBlockId);
    const leftLinksByManuscriptBlockId = useAppStore((state) => state.leftLinksByManuscriptBlockId);
    const rightLinksByManuscriptBlockId = useAppStore((state) => state.rightLinksByManuscriptBlockId);
    const autosave = useMemo(() => debounce((json: string) => props.onAutosave(json), 700), [props.onAutosave]);
    const handleToolbarStateChange = useCallback((nextState: ManuscriptToolbarState) => {
      setToolbarState((previousState) =>
        manuscriptToolbarStateEquals(previousState, nextState) ? previousState : nextState
      );
    }, []);
    const handleBlurSave = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const json = JSON.stringify(editor.getEditorState().toJSON());
      autosave.cancel();
      props.onAutosave(json);
    }, [autosave, props.onAutosave]);
    useEffect(() => {
      const shellElement = shellRef.current;
      if (!shellElement) {
        return;
      }

      const handleFocusIn = () => {
        setIsEditorFocused(true);
        props.onFocusChange?.(true);
      };
      const handleFocusOut = () => {
        window.setTimeout(() => {
          const activeElement = document.activeElement;
          const focusedWithinShell = Boolean(
            activeElement instanceof Node && shellElement.contains(activeElement),
          );
          setIsEditorFocused(focusedWithinShell);
          props.onFocusChange?.(focusedWithinShell);
        }, 0);
      };

      shellElement.addEventListener("focusin", handleFocusIn);
      shellElement.addEventListener("focusout", handleFocusOut);
      return () => {
        shellElement.removeEventListener("focusin", handleFocusIn);
        shellElement.removeEventListener("focusout", handleFocusOut);
      };
    }, [props.onFocusChange]);
    const runStructuralOperation = useCallback(
      (operation: (blockId?: string | null) => string | null, blockId?: string | null): string | null => {
        const editor = editorRef.current;
        if (!editor) {
          return null;
        }

        let result: string | null = null;
        editor.update(() => {
          result = operation(blockId);
        });
        editor.focus();
        return result;
      },
      [],
    );
    useEffect(() => {
      return () => {
        autosave.flush();
      };
    }, [autosave]);

    useEffect(() => {
      setLiveUnitCount(props.unitCount);
    }, [props.unitCount, props.initialStateJson]);

    useEffect(() => {
      const root = editorRef.current?.getRootElement();
      if (!root) {
        return;
      }

      const blockElements = root.querySelectorAll<HTMLElement>("[data-manuscript-block-id]");
      for (const element of blockElements) {
        const blockId = element.dataset.manuscriptBlockId ?? "";
        const leftCount = leftLinksByManuscriptBlockId[blockId]?.length ?? 0;
        const rightCount = rightLinksByManuscriptBlockId[blockId]?.length ?? 0;
        element.dataset.currentBlock = blockId.length > 0 && blockId === currentManuscriptBlockId ? "true" : "false";
        element.dataset.hasLinkedNotes = leftCount + rightCount > 0 ? "true" : "false";
        element.dataset.leftLinkedCount = String(leftCount);
        element.dataset.rightLinkedCount = String(rightCount);
      }
    }, [currentManuscriptBlockId, leftLinksByManuscriptBlockId, rightLinksByManuscriptBlockId, props.initialStateJson]);

    useImperativeHandle(
      ref,
      () => ({
        focusBlockById: (blockId: string) => {
          const editor = editorRef.current;
          if (!editor) {
            return;
          }

          editor.update(() => {
            const node = findManuscriptBlockNodeById(blockId);
            if (node) {
              node.selectStart();
            }
          });

          const root = editor.getRootElement();
          const target = root?.querySelector<HTMLElement>(`[data-manuscript-block-id="${blockId}"]`);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          editor.focus();
        },
        focusEditor: () => {
          editorRef.current?.focus();
        },
        getHtml: () => {
          const editor = editorRef.current;
          if (!editor) {
            return "";
          }

          let html = "";
          editor.getEditorState().read(() => {
            html = $generateHtmlFromNodes(editor, null);
          });
          return html;
        },
        getLexicalJson: () => {
          const editor = editorRef.current;
          if (!editor) {
            return props.initialStateJson;
          }
          return JSON.stringify(editor.getEditorState().toJSON());
        },
        listBlockIds: () => {
          const editor = editorRef.current;
          if (!editor) {
            return [];
          }

          let blockIds: string[] = [];
          editor.getEditorState().read(() => {
            blockIds = collectManuscriptBlockIds();
          });
          return blockIds;
        },
        ensureCurrentSelectionBlockId: () => {
          const editor = editorRef.current;
          if (!editor) {
            return null;
          }

          let ensuredBlockId: string | null = null;
          editor.update(() => {
            ensuredBlockId = ensureCurrentSelectionBlockIdInEditor();
          });
          return ensuredBlockId;
        },
        createLinkedPassageBlock: () => {
          const editor = editorRef.current;
          if (!editor) {
            return null;
          }

          let createdBlockId: string | null = null;
          editor.update(() => {
            createdBlockId = insertLinkedPassageAfterSelection();
          });
          return createdBlockId;
        },
        insertBlockBefore: (blockId) => runStructuralOperation(insertManuscriptBlockBeforeCurrent, blockId),
        insertBlockAfter: (blockId) => runStructuralOperation(insertManuscriptBlockAfterCurrent, blockId),
        duplicateBlock: (blockId) => runStructuralOperation(duplicateCurrentManuscriptBlock, blockId),
        moveBlockUp: (blockId) => runStructuralOperation(moveCurrentManuscriptBlockUp, blockId),
        moveBlockDown: (blockId) => runStructuralOperation(moveCurrentManuscriptBlockDown, blockId),
        deleteBlock: (blockId) => runStructuralOperation(deleteCurrentManuscriptBlock, blockId),
      }),
      [props.initialStateJson, runStructuralOperation],
    );

    const initialConfig = useMemo(
      () => ({
        namespace: "marginalia-manuscript",
        theme: MANUSCRIPT_THEME,
        onError(error: Error) {
          throw error;
        },
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
        editorState: props.initialStateJson,
      }),
      [props.initialStateJson],
    );

    return (
      <div ref={shellRef} className="editor-shell editor-shell-manuscript">
        <ManuscriptToolbar
          editorRef={editorRef}
          toolbarState={toolbarState}
          unitCount={liveUnitCount}
          isFocused={isEditorFocused}
          onCreateLinkedMarginalia={props.onCreateLinkedMarginalia}
          onRevealMarginalia={props.onRevealMarginalia}
          onInsertUnitBefore={props.onInsertUnitBefore}
          onInsertUnitAfter={props.onInsertUnitAfter}
          onDuplicateUnit={props.onDuplicateUnit}
          onMoveUnitUp={props.onMoveUnitUp}
          onMoveUnitDown={props.onMoveUnitDown}
          onDeleteUnit={props.onDeleteUnit}
        />
        <LexicalComposer initialConfig={initialConfig}>
          <div className={`lexical-scroll manuscript-scroll ${props.pagePreview ? "page-preview" : ""}`}>
            <div ref={contentWrapRef} className="editor-content-wrap manuscript-page">
              <RichTextPlugin
                contentEditable={<ContentEditable className="lexical-editor" aria-label="Manuscript editor" />}
                placeholder={
                  <div className="lexical-placeholder manuscript-placeholder">
                    <span className="manuscript-placeholder-title">Start the sequence of units.</span>
                    <span className="manuscript-placeholder-copy">
                      Write the opening passage here, then insert new units between existing ones as
                      the draft takes shape.
                    </span>
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <UnitInsertionOverlayPlugin
                hostRef={contentWrapRef}
                onInsertUnitBeforeBlock={props.onInsertUnitBeforeBlock}
                onInsertUnitAfterBlock={props.onInsertUnitAfterBlock}
                onInsertUnitAtStart={props.onInsertUnitAtStart}
              />
            </div>
          </div>
          <HistoryPlugin />
          <ListPlugin />
          <OnChangePlugin
            ignoreSelectionChange
            onChange={(editorState) => {
              autosave(JSON.stringify(editorState.toJSON()));
            }}
          />
          <BlockIdPlugin onCurrentBlockIdChange={props.onCurrentBlockIdChange} />
          <EditorBridgePlugin
            editorRef={editorRef}
            onCreateLinkedMarginalia={props.onCreateLinkedMarginalia}
            onRevealMarginalia={props.onRevealMarginalia}
            onQuickInsertUnit={props.onQuickInsertUnit}
            onMoveUnitUp={props.onMoveUnitUp}
            onMoveUnitDown={props.onMoveUnitDown}
            onUnitCountChange={setLiveUnitCount}
            onExcerptIndexChange={props.onExcerptIndexChange}
            onToolbarStateChange={handleToolbarStateChange}
            onBlurSave={handleBlurSave}
          />
        </LexicalComposer>
      </div>
    );
  },
);
