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
import {
  findManuscriptBlockNodeById,
  getCurrentSelectionBlockId,
  getSelectionBlockNode,
  ensureCurrentSelectionBlockId as ensureCurrentSelectionBlockIdInEditor,
  insertLinkedPassageAfterSelection,
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
  ensureCurrentSelectionBlockId: () => string | null;
  createLinkedPassageBlock: () => string | null;
}

interface ManuscriptEditorProps {
  initialStateJson: string;
  pagePreview: boolean;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (blockId: string | null) => void;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
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
  onToolbarStateChange: (state: ManuscriptToolbarState) => void;
  onBlurSave: () => void;
  onFocusChange?: (focused: boolean) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const callbacksRef = useRef({
    onCreateLinkedMarginalia: props.onCreateLinkedMarginalia,
    onRevealMarginalia: props.onRevealMarginalia,
    onToolbarStateChange: props.onToolbarStateChange,
    onBlurSave: props.onBlurSave,
    onFocusChange: props.onFocusChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      onCreateLinkedMarginalia: props.onCreateLinkedMarginalia,
      onRevealMarginalia: props.onRevealMarginalia,
      onToolbarStateChange: props.onToolbarStateChange,
      onBlurSave: props.onBlurSave,
      onFocusChange: props.onFocusChange,
    };
  }, [
    props.onCreateLinkedMarginalia,
    props.onRevealMarginalia,
    props.onToolbarStateChange,
    props.onBlurSave,
    props.onFocusChange,
  ]);

  useEffect(() => {
    props.editorRef.current = editor;
    return () => {
      props.editorRef.current = null;
    };
  }, [editor, props.editorRef]);

  useEffect(() => {
    const syncToolbarState = () => {
      editor.getEditorState().read(() => {
        callbacksRef.current.onToolbarStateChange(readManuscriptToolbarState());
      });
    };

    syncToolbarState();

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
      editor.registerUpdateListener(() => {
        syncToolbarState();
      }),
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      const handleBlur = () => callbacksRef.current.onBlurSave();
      const handleFocusIn = () => callbacksRef.current.onFocusChange?.(true);
      const handleFocusOut = () => {
        window.setTimeout(() => {
          const root = editor.getRootElement();
          const activeElement = document.activeElement;
          callbacksRef.current.onFocusChange?.(
            Boolean(root && activeElement instanceof Node && root.contains(activeElement))
          );
        }, 0);
      };
      if (prevRootElement) {
        prevRootElement.removeEventListener("blur", handleBlur, true);
        prevRootElement.removeEventListener("focusin", handleFocusIn);
        prevRootElement.removeEventListener("focusout", handleFocusOut);
      }
      if (rootElement) {
        rootElement.addEventListener("blur", handleBlur, true);
        rootElement.addEventListener("focusin", handleFocusIn);
        rootElement.addEventListener("focusout", handleFocusOut);
      }
    });
  }, [editor]);

  return null;
}

function ManuscriptToolbar(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  toolbarState: ManuscriptToolbarState;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
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

  return (
    <>
      <div className="editor-toolbar editor-toolbar-manuscript">
        <span className="editor-toolbar-label">Manuscript</span>
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
      <div className="margin-writing-status manuscript-context-row">
        <span className={`margin-status-chip ${currentManuscriptBlockId ? "is-targeting" : ""}`}>
          {currentManuscriptBlockId ? `Passage ${currentManuscriptBlockId.slice(0, 8)}` : "Select or create a passage"}
        </span>
        {currentManuscriptBlockId ? (
          <span className="margin-status-chip">Scholies {linkedLeftCount} / Sources {linkedRightCount}</span>
        ) : null}
        <details className="context-help">
          <summary>Help</summary>
          <div className="context-help-body">
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+N add scholie for passage</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+G reveal scholies</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+1/2/3 apply heading</span>
            <span className="margin-shortcut-hint">Ctrl/Cmd+Alt+0 return to paragraph</span>
          </div>
        </details>
      </div>
    </>
  );
}

export const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(
  function ManuscriptEditorComponent(props, ref) {
    const editorRef = useRef<LexicalEditor | null>(null);
    const [toolbarState, setToolbarState] = useState<ManuscriptToolbarState>(DEFAULT_MANUSCRIPT_TOOLBAR_STATE);
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
      return () => {
        autosave.flush();
      };
    }, [autosave]);

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
      }),
      [props.initialStateJson],
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
      <div className="editor-shell editor-shell-manuscript">
        <ManuscriptToolbar
          editorRef={editorRef}
          toolbarState={toolbarState}
          onCreateLinkedMarginalia={props.onCreateLinkedMarginalia}
          onRevealMarginalia={props.onRevealMarginalia}
        />
        <LexicalComposer initialConfig={initialConfig}>
          <div className={`lexical-scroll manuscript-scroll ${props.pagePreview ? "page-preview" : ""}`}>
            <div className="editor-content-wrap manuscript-page">
              <RichTextPlugin
                contentEditable={<ContentEditable className="lexical-editor" aria-label="Manuscript editor" />}
                placeholder={
                  <div className="lexical-placeholder manuscript-placeholder">
                    <span className="manuscript-placeholder-title">Begin the manuscript.</span>
                    <span className="manuscript-placeholder-copy">
                      Draft a passage here, then attach a scholie when a block needs commentary.
                    </span>
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
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
            onToolbarStateChange={handleToolbarStateChange}
            onFocusChange={props.onFocusChange}
            onBlurSave={handleBlurSave}
          />
        </LexicalComposer>
      </div>
    );
  },
);
