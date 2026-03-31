import {
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PaneSizes } from "../../state/useAppStore";

interface ThreePaneLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  rightVisible: boolean;
  activePane: "left" | "center" | "right" | null;
  paneSizes: PaneSizes;
  onPaneSizesChange: (sizes: PaneSizes) => void;
}

const MIN_LEFT_RATIO = 0.15;
const MAX_LEFT_RATIO = 0.24;
const MIN_RIGHT_RATIO = 0.14;
const MAX_RIGHT_RATIO = 0.22;
// Safety fallback: pointer-capture based resize can lock input on some Windows/WebView setups.
// Keep keyboard resize active, but disable pointer resize until a fully stable implementation lands.
const ENABLE_POINTER_RESIZE = false;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ThreePaneLayout(props: ThreePaneLayoutProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleResizeStart = (side: "left" | "right") => (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    const bounds = root.getBoundingClientRect();
    const startLeft = props.paneSizes.left;
    const startRight = props.paneSizes.right;
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    const previousBodyUserSelect = document.body.style.userSelect;
    const previousBodyCursor = document.body.style.cursor;
    let cleaned = false;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    event.preventDefault();

    const move = (moveEvent: PointerEvent) => {
      if (side === "left") {
        const ratio = (moveEvent.clientX - bounds.left) / bounds.width;
        props.onPaneSizesChange({
          left: clamp(ratio, MIN_LEFT_RATIO, MAX_LEFT_RATIO),
          right: startRight,
        });
      } else {
        const ratio = (bounds.right - moveEvent.clientX) / bounds.width;
        props.onPaneSizesChange({
          left: startLeft,
          right: clamp(ratio, MIN_RIGHT_RATIO, MAX_RIGHT_RATIO),
        });
      }
    };

    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;

      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
      handle.removeEventListener("lostpointercapture", onLostPointerCapture as EventListener);
      document.body.style.userSelect = previousBodyUserSelect;
      document.body.style.cursor = previousBodyCursor;

      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      cleanup();
    };

    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) {
        return;
      }
      cleanup();
    };

    const onWindowBlur = () => {
      cleanup();
    };

    const onLostPointerCapture = (lostEvent: PointerEvent) => {
      if (lostEvent.pointerId !== pointerId) {
        return;
      }
      cleanup();
    };

    handle.setPointerCapture(pointerId);
    handle.addEventListener("lostpointercapture", onLostPointerCapture as EventListener);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onWindowBlur);
  };

  const handleResizerKey = (side: "left" | "right") => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.shiftKey ? 0.03 : 0.015;
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (direction === 0) {
      return;
    }

    event.preventDefault();
    if (side === "left") {
      props.onPaneSizesChange({
        left: clamp(props.paneSizes.left + delta * direction, MIN_LEFT_RATIO, MAX_LEFT_RATIO),
        right: props.paneSizes.right,
      });
      return;
    }

    props.onPaneSizesChange({
      left: props.paneSizes.left,
      right: clamp(props.paneSizes.right - delta * direction, MIN_RIGHT_RATIO, MAX_RIGHT_RATIO),
    });
  };

  const leftWidth = clamp(props.paneSizes.left, MIN_LEFT_RATIO, MAX_LEFT_RATIO);
  const rightWidth = clamp(props.paneSizes.right, MIN_RIGHT_RATIO, MAX_RIGHT_RATIO);

  const style = {
    ["--left-width" as string]: `${leftWidth * 100}%`,
    ["--right-width" as string]: `${rightWidth * 100}%`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className="three-pane-root" data-right-hidden={!props.rightVisible} style={style}>
      <section className="pane pane-left" data-active={props.activePane === "left"}>{props.left}</section>
      <div
        className="resizer"
        role="separator"
        aria-label="Resize left pane"
        tabIndex={0}
        onPointerDown={ENABLE_POINTER_RESIZE ? handleResizeStart("left") : undefined}
        onKeyDown={handleResizerKey("left")}
      />
      <section className="pane pane-center" data-active={props.activePane === "center"}>{props.center}</section>
      <div
        className="resizer"
        role="separator"
        aria-label="Resize right pane"
        tabIndex={props.rightVisible ? 0 : -1}
        onPointerDown={props.rightVisible && ENABLE_POINTER_RESIZE ? handleResizeStart("right") : undefined}
        onKeyDown={props.rightVisible ? handleResizerKey("right") : undefined}
      />
      <section className="pane pane-right" data-active={props.activePane === "right"}>{props.rightVisible ? props.right : null}</section>
    </div>
  );
}
