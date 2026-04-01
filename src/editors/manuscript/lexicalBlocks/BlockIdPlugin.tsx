import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { collectBlockDomBindings, getCurrentSelectionBlockId } from "./manuscriptBlockUtils";

export function BlockIdPlugin(props: { onCurrentBlockIdChange: (blockId: string | null) => void }): null {
  const [editor] = useLexicalComposerContext();
  const { onCurrentBlockIdChange } = props;

  useEffect(() => {
    editor.getEditorState().read(() => {
      onCurrentBlockIdChange(getCurrentSelectionBlockId());
    });

    return mergeRegister(
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
