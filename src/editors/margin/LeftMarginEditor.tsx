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
  onRequestCreateLinkedNote?: () => void;
  onMoveLinkedUnitUp?: (marginBlockId: string) => void;
  onMoveLinkedUnitDown?: (marginBlockId: string) => void;
  onMoveLinkedUnitToMarginTarget?: (
    sourceMarginBlockId: string,
    targetMarginBlockId: string,
    position: "before" | "after",
  ) => boolean;
  pointerBlockDragEnabled: boolean;
  onDisablePointerBlockDrag?: (message: string) => void;
  onFocusChange?: (focused: boolean) => void;
  legacyDuplicateSummary?: {
    affectedUnitCount: number;
    duplicateScholieCount: number;
  } | null;
}

export const LeftMarginEditor = forwardRef<LeftMarginEditorHandle, LeftMarginEditorProps>(
  function LeftMarginEditorComponent(props, ref) {
    return (
      <MarginEditorBase
        ref={ref}
        kind="left"
        title="Scholies"
        subtitle="Critical glosses aligned to the draft."
        initialStateJson={props.initialStateJson}
        manuscriptExcerptByBlockId={props.manuscriptExcerptByBlockId}
        onAutosave={props.onAutosave}
        onCurrentBlockIdChange={props.onCurrentBlockIdChange}
        onLinkIndexChange={props.onLinkIndexChange}
        onNavigateToManuscriptBlock={props.onNavigateToManuscriptBlock}
        onRequestCreateLinkedNote={props.onRequestCreateLinkedNote}
        onMoveLinkedUnitUp={props.onMoveLinkedUnitUp}
        onMoveLinkedUnitDown={props.onMoveLinkedUnitDown}
        onMoveLinkedUnitToMarginTarget={props.onMoveLinkedUnitToMarginTarget}
        pointerBlockDragEnabled={props.pointerBlockDragEnabled}
        onDisablePointerBlockDrag={props.onDisablePointerBlockDrag}
        onFocusChange={props.onFocusChange}
        legacyDuplicateSummary={props.legacyDuplicateSummary}
      />
    );
  },
);
