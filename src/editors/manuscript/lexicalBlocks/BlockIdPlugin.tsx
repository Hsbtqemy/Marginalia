import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListItemNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  COMMAND_PRIORITY_LOW,
  ParagraphNode,
  SELECTION_CHANGE_COMMAND,
  type LexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { ensureBlockId } from "./blockIdState";
import { collectBlockDomBindings, getCurrentSelectionBlockId, isManuscriptBlockNode } from "./manuscriptBlockUtils";

function handleBlockIdTransform(node: LexicalNode): void {
  if (isManuscriptBlockNode(node)) {
    ensureBlockId(node);
  }
}

export function BlockIdPlugin(props: { onCurrentBlockIdChange: (blockId: string | null) => void }): null {
  const [editor] = useLexicalComposerContext();
  const { onCurrentBlockIdChange } = props;

  useEffect(() => {
    editor.getEditorState().read(() => {
      onCurrentBlockIdChange(getCurrentSelectionBlockId());
    });

    return mergeRegister(
      editor.registerNodeTransform(ParagraphNode, handleBlockIdTransform),
      editor.registerNodeTransform(HeadingNode, handleBlockIdTransform),
      editor.registerNodeTransform(QuoteNode, handleBlockIdTransform),
      editor.registerNodeTransform(ListItemNode, handleBlockIdTransform),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(() => {
            onCurrentBlockIdChange(getCurrentSelectionBlockId());
          });
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        const bindings: Array<{ key: string; blockId: string }> = [];

        editorState.read(() => {
          bindings.push(...collectBlockDomBindings());
        });

        for (const binding of bindings) {
          const element = editor.getElementByKey(binding.key);
          if (element) {
            element.dataset.manuscriptBlockId = binding.blockId;
          }
        }
      }),
    );
  }, [editor, onCurrentBlockIdChange]);

  return null;
}
