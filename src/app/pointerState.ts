export function releaseStuckPointerState(doc: Document = document): void {
  const pointerCaptureElements = doc.querySelectorAll<HTMLElement>("[data-pointer-capture-id]");
  for (const element of pointerCaptureElements) {
    if (typeof element.hasPointerCapture !== "function") {
      delete element.dataset.pointerCaptureId;
      continue;
    }

    const pointerId = Number.parseInt(element.dataset.pointerCaptureId ?? "", 10);
    if (Number.isFinite(pointerId)) {
      try {
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore stale pointer capture handles.
      }
    }

    delete element.dataset.pointerCaptureId;
    delete element.dataset.resizing;
  }

  doc.body.style.userSelect = "";
  if (doc.body.style.cursor === "grabbing" || doc.body.style.cursor === "col-resize") {
    doc.body.style.cursor = "";
  }

  const draggingRoots = doc.querySelectorAll<HTMLElement>("[data-dragging='true']");
  for (const root of draggingRoots) {
    delete root.dataset.dragging;
  }

  const grabbedHandles = doc.querySelectorAll<HTMLElement>("[data-grabbed='true']");
  for (const handle of grabbedHandles) {
    handle.dataset.grabbed = "false";
  }

  const dropTargets = doc.querySelectorAll<HTMLElement>("[data-drop-position]");
  for (const target of dropTargets) {
    delete target.dataset.dropPosition;
  }

  const resizingRoots = doc.querySelectorAll<HTMLElement>("[data-resizing]");
  for (const root of resizingRoots) {
    delete root.dataset.resizing;
  }
}
