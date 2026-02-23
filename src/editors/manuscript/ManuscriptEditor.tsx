import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
import { debounce } from "../../utils/debounce";
import { BlockIdPlugin } from "./lexicalBlocks/BlockIdPlugin";
import {
  findManuscriptBlockNodeById,
  getCurrentSelectionBlockId,
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
}

interface ManuscriptEditorProps {
  initialStateJson: string;
  pagePreview: boolean;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (blockId: string | null) => void;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
}

function EditorBridgePlugin(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  onCreateLinkedMarginalia: (manuscriptBlockId: string | null) => void;
  onBlurSave: () => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    props.editorRef.current = editor;
    return () => {
      props.editorRef.current = null;
    };
  }, [editor, props.editorRef]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const isMainModifier = event.metaKey || event.ctrlKey;
        if (isMainModifier && event.altKey && event.key.toLowerCase() === "n") {
          event.preventDefault();
          editor.getEditorState().read(() => {
            props.onCreateLinkedMarginalia(getCurrentSelectionBlockId());
          });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, props]);

  useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      const handleBlur = () => props.onBlurSave();
      if (prevRootElement) {
        prevRootElement.removeEventListener("blur", handleBlur, true);
      }
      if (rootElement) {
        rootElement.addEventListener("blur", handleBlur, true);
      }
    });
  }, [editor, props]);

  return null;
}

function ManuscriptToolbar(props: {
  editorRef: MutableRefObject<LexicalEditor | null>;
  onRevealMarginalia: (manuscriptBlockId: string | null) => void;
}) {
  const runInEditor = (callback: (editor: LexicalEditor) => void) => {
    const editor = props.editorRef.current;
    if (!editor) {
      return;
    }
    callback(editor);
  };

  const setBlockType = (type: "paragraph" | "h1" | "h2" | "h3" | "quote") => {
    runInEditor((editor) => {
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
    <div className="editor-toolbar">
      <span className="editor-toolbar-label">Manuscript</span>
      <button className="toolbar-button" type="button" onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}>
        Bold
      </button>
      <button className="toolbar-button" type="button" onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}>
        Italic
      </button>
      <button className="toolbar-button" type="button" onClick={() => runInEditor((editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"))}>
        Underline
      </button>
      <button className="toolbar-button" type="button" onClick={() => setBlockType("h1")}>
        H1
      </button>
      <button className="toolbar-button" type="button" onClick={() => setBlockType("h2")}>
        H2
      </button>
      <button className="toolbar-button" type="button" onClick={() => setBlockType("h3")}>
        H3
      </button>
      <button className="toolbar-button" type="button" onClick={() => setBlockType("quote")}>
        Quote
      </button>
      <button
        className="toolbar-button"
        type="button"
        onClick={() => runInEditor((editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined))}
      >
        Bullets
      </button>
      <button
        className="toolbar-button"
        type="button"
        onClick={() => runInEditor((editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined))}
      >
        Numbers
      </button>
      <button className="toolbar-button" type="button" onClick={() => runInEditor((editor) => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined))}>
        No List
      </button>
      <button
        className="toolbar-button"
        type="button"
        onClick={() =>
          runInEditor((editor) =>
            editor.getEditorState().read(() => {
              props.onRevealMarginalia(getCurrentSelectionBlockId());
            }),
          )
        }
      >
        Reveal Marginalia
      </button>
    </div>
  );
}

export const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(
  function ManuscriptEditorComponent(props, ref) {
    const editorRef = useRef<LexicalEditor | null>(null);
    const autosave = useMemo(() => debounce((json: string) => props.onAutosave(json), 700), [props]);

    useEffect(() => {
      return () => {
        autosave.flush();
      };
    }, [autosave]);

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
      <div className="editor-shell">
        <ManuscriptToolbar
          editorRef={editorRef}
          onRevealMarginalia={props.onRevealMarginalia}
        />
        <LexicalComposer initialConfig={initialConfig}>
          <div className={`lexical-scroll ${props.pagePreview ? "page-preview" : ""}`}>
            <div className="editor-content-wrap">
              <RichTextPlugin
                contentEditable={<ContentEditable className="lexical-editor" aria-label="Manuscript editor" />}
                placeholder={<div className="lexical-placeholder">Write your manuscript…</div>}
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
            onBlurSave={() => {
              const editor = editorRef.current;
              if (!editor) {
                return;
              }
              const json = JSON.stringify(editor.getEditorState().toJSON());
              autosave.cancel();
              props.onAutosave(json);
            }}
          />
        </LexicalComposer>
      </div>
    );
  },
);
