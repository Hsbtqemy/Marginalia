import { forwardRef } from "react";
import { MarginEditorBase, type MarginEditorHandle } from "./MarginEditorBase";

export type LeftMarginEditorHandle = MarginEditorHandle;

interface LeftMarginEditorProps {
  initialStateJson: string;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (marginBlockId: string | null) => void;
  onLinkIndexChange: (index: Record<string, string[]>) => void;
  onNavigateToManuscriptBlock: (manuscriptBlockId: string) => void;
}

export const LeftMarginEditor = forwardRef<LeftMarginEditorHandle, LeftMarginEditorProps>(
  function LeftMarginEditorComponent(props, ref) {
    return (
      <MarginEditorBase
        ref={ref}
        kind="left"
        title="Marginalia"
        initialStateJson={props.initialStateJson}
        onAutosave={props.onAutosave}
        onCurrentBlockIdChange={props.onCurrentBlockIdChange}
        onLinkIndexChange={props.onLinkIndexChange}
        onNavigateToManuscriptBlock={props.onNavigateToManuscriptBlock}
      />
    );
  },
);
