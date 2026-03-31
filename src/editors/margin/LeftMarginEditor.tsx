import { forwardRef } from "react";
import { MarginEditorBase, type MarginEditorHandle } from "./MarginEditorBase";

export type LeftMarginEditorHandle = MarginEditorHandle;

interface LeftMarginEditorProps {
  initialStateJson: string;
  manuscriptExcerptByBlockId: Record<string, string>;
  onAutosave: (lexicalJson: string) => void;
  onCurrentBlockIdChange: (marginBlockId: string | null) => void;
  onLinkIndexChange: (index: Record<string, string[]>) => void;
  onNavigateToManuscriptBlock: (manuscriptBlockId: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

export const LeftMarginEditor = forwardRef<LeftMarginEditorHandle, LeftMarginEditorProps>(
  function LeftMarginEditorComponent(props, ref) {
    return (
      <MarginEditorBase
        ref={ref}
        kind="left"
        title="Marginalia"
        subtitle="Working notes, reflections, and linked passages."
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
