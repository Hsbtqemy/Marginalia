import { forwardRef } from "react";
import { MarginEditorBase, type MarginEditorHandle } from "./MarginEditorBase";

export type RightMarginEditorHandle = MarginEditorHandle;

interface RightMarginEditorProps {
  initialStateJson: string;
  manuscriptExcerptByBlockId: Record<string, string>;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (marginBlockId: string | null) => void;
  onLinkIndexChange: (index: Record<string, string[]>) => void;
  onNavigateToManuscriptBlock: (manuscriptBlockId: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

export const RightMarginEditor = forwardRef<RightMarginEditorHandle, RightMarginEditorProps>(
  function RightMarginEditorComponent(props, ref) {
    return (
      <MarginEditorBase
        ref={ref}
        kind="right"
        title="Sources & Notes"
        subtitle="Citations, references, and supporting notes."
        initialStateJson={props.initialStateJson}
        manuscriptExcerptByBlockId={props.manuscriptExcerptByBlockId}
        onAutosave={props.onAutosave}
        onCurrentBlockIdChange={props.onCurrentBlockIdChange}
        onLinkIndexChange={props.onLinkIndexChange}
        onNavigateToManuscriptBlock={props.onNavigateToManuscriptBlock}
        onFocusChange={props.onFocusChange}
      />
    );
  },
);
