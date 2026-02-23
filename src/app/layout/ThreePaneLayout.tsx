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
  paneSizes: PaneSizes;
  onPaneSizesChange: (sizes: PaneSizes) => void;
}

const MIN_LEFT_RATIO = 0.18;
const MAX_LEFT_RATIO = 0.42;
const MIN_RIGHT_RATIO = 0.16;
const MAX_RIGHT_RATIO = 0.36;

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

    const bounds = root.getBoundingClientRect();
    const startLeft = props.paneSizes.left;
    const startRight = props.paneSizes.right;
    const pointerId = event.pointerId;

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

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      root.releasePointerCapture(pointerId);
    };

    root.setPointerCapture(pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
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

  const style = {
    ["--left-width" as string]: `${props.paneSizes.left * 100}%`,
    ["--right-width" as string]: `${props.paneSizes.right * 100}%`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className="three-pane-root" data-right-hidden={!props.rightVisible} style={style}>
      <section className="pane pane-left">{props.left}</section>
      <div
        className="resizer"
        role="separator"
        aria-label="Resize left pane"
        tabIndex={0}
        onPointerDown={handleResizeStart("left")}
        onKeyDown={handleResizerKey("left")}
      />
      <section className="pane pane-center">{props.center}</section>
      <div
        className="resizer"
        role="separator"
        aria-label="Resize right pane"
        tabIndex={props.rightVisible ? 0 : -1}
        onPointerDown={props.rightVisible ? handleResizeStart("right") : undefined}
        onKeyDown={props.rightVisible ? handleResizerKey("right") : undefined}
      />
      <section className="pane pane-right">{props.rightVisible ? props.right : null}</section>
    </div>
  );
}
