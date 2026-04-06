import {
  useEffect,
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

const MIN_LEFT_RATIO = 0.13;
const MAX_LEFT_RATIO = 0.22;
const MIN_RIGHT_RATIO = 0.12;
const MAX_RIGHT_RATIO = 0.2;
const ENABLE_POINTER_RESIZE = false;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ThreePaneLayout(props: ThreePaneLayoutProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      activeResizeCleanupRef.current?.();
      activeResizeCleanupRef.current = null;
    };
  }, []);

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

    activeResizeCleanupRef.current?.();
    activeResizeCleanupRef.current = null;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    root.dataset.resizing = side;
    handle.dataset.resizing = "true";
    handle.dataset.pointerCaptureId = String(pointerId);

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

      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      handle.removeEventListener("lostpointercapture", onLostPointerCapture as EventListener);
      delete handle.dataset.resizing;
      delete handle.dataset.pointerCaptureId;
      if (root.dataset.resizing === side) {
        delete root.dataset.resizing;
      }
      document.body.style.userSelect = previousBodyUserSelect;
      document.body.style.cursor = previousBodyCursor;

      try {
        if (typeof handle.hasPointerCapture === "function" && handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore stale pointer capture state when the runtime has already released it.
      }

      if (activeResizeCleanupRef.current === cleanup) {
        activeResizeCleanupRef.current = null;
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

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cleanup();
      }
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        cleanup();
      }
    };

    const onLostPointerCapture = (lostEvent: PointerEvent) => {
      if (lostEvent.pointerId !== pointerId) {
        return;
      }
      cleanup();
    };

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      cleanup();
      return;
    }

    activeResizeCleanupRef.current = cleanup;
    handle.addEventListener("lostpointercapture", onLostPointerCapture as EventListener);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
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
