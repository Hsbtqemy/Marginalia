import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { releaseStuckPointerState } from "./pointerState";

type PointerAwareElement = HTMLElement & {
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
};

test("releaseStuckPointerState clears capture markers and transient drag state", () => {
  const dom = new JSDOM(
    "<!doctype html><body><div id='capture'></div><div id='dragging' data-dragging='true'></div><div id='grabbed' data-grabbed='true'></div><div id='drop' data-drop-position='before'></div><div id='resizing' data-resizing='left'></div></body>",
  );
  const { document } = dom.window;
  const capture = document.getElementById("capture") as PointerAwareElement;
  const dragging = document.getElementById("dragging") as HTMLElement;
  const grabbed = document.getElementById("grabbed") as HTMLElement;
  const drop = document.getElementById("drop") as HTMLElement;
  const resizing = document.getElementById("resizing") as HTMLElement;
  const releasedPointerIds: number[] = [];

  capture.dataset.pointerCaptureId = "7";
  capture.dataset.resizing = "true";
  capture.hasPointerCapture = (pointerId) => pointerId === 7;
  capture.releasePointerCapture = (pointerId) => {
    releasedPointerIds.push(pointerId);
  };
  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";

  releaseStuckPointerState(document);

  assert.deepEqual(releasedPointerIds, [7]);
  assert.equal(capture.dataset.pointerCaptureId, undefined);
  assert.equal(capture.dataset.resizing, undefined);
  assert.equal(dragging.dataset.dragging, undefined);
  assert.equal(grabbed.dataset.grabbed, "false");
  assert.equal(drop.dataset.dropPosition, undefined);
  assert.equal(resizing.dataset.resizing, undefined);
  assert.equal(document.body.style.userSelect, "");
  assert.equal(document.body.style.cursor, "");
});

test("releaseStuckPointerState tolerates elements without pointer capture support", () => {
  const dom = new JSDOM("<!doctype html><body><div id='capture' data-pointer-capture-id='invalid'></div></body>");
  const { document } = dom.window;
  const capture = document.getElementById("capture") as HTMLElement;

  releaseStuckPointerState(document);

  assert.equal(capture.dataset.pointerCaptureId, undefined);
});
