/** A canvas touch can reveal UI before the browser dispatches its follow-up click. */
export function suppressCanvasTouchClick(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const document = canvas.ownerDocument;
  let pendingTouchClick = false;
  const options = { capture: true, signal };
  document.addEventListener(
    "pointerdown",
    () => {
      pendingTouchClick = false;
    },
    options,
  );
  document.addEventListener(
    "pointercancel",
    () => {
      pendingTouchClick = false;
    },
    options,
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerType === "touch" && event.composedPath().includes(canvas))
        pendingTouchClick = true;
    },
    options,
  );
  // Some controls react to compatibility mouse events before the final click.
  for (const type of ["mousedown", "mouseup"] as const)
    document.addEventListener(
      type,
      (event) => {
        if (pendingTouchClick && event.detail > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      options,
    );
  document.addEventListener(
    "click",
    (event) => {
      const suppress = pendingTouchClick && event.detail > 0;
      pendingTouchClick = false;
      if (suppress) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    options,
  );
}
