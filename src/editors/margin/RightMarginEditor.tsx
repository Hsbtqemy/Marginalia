import { forwardRef } from "react";
import { MarginEditorBase, type MarginEditorHandle } from "./MarginEditorBase";

export type RightMarginEditorHandle = MarginEditorHandle;

interface RightMarginEditorProps {
  initialStateJson: string;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (marginBlockId: string | null) => void;
  onLinkIndexChange: (index: Record<string, string[]>) => void;
  onNavigateToManuscriptBlock: (manuscriptBlockId: string) => void;
}

export const RightMarginEditor = forwardRef<RightMarginEditorHandle, RightMarginEditorProps>(
  function RightMarginEditorComponent(props, ref) {
    return (
      <MarginEditorBase
        ref={ref}
        kind="right"
        title="Citations / Notes"
        initialStateJson={props.initialStateJson}
        onAutosave={props.onAutosave}
        onCurrentBlockIdChange={props.onCurrentBlockIdChange}
        onLinkIndexChange={props.onLinkIndexChange}
        onNavigateToManuscriptBlock={props.onNavigateToManuscriptBlock}
      />
    );
  },
);
