import * as React from "react";

/** Resize the visible sheet itself so its footer stays above the keyboard. */
export function useDrawerResize(enabled: boolean, onClose: () => void) {
  const [height, setHeight] = React.useState<number>();
  const [viewport, setViewport] = React.useState({ height: window.innerHeight, bottom: 0 });
  const drag = React.useRef<{ pointerId: number; y: number; height: number } | null>(null);
  const [resizing, setResizing] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return undefined;
    const visual = window.visualViewport;
    const update = () =>
      setViewport({
        height: visual?.height ?? window.innerHeight,
        bottom: Math.max(
          0,
          window.innerHeight - (visual?.height ?? window.innerHeight) - (visual?.offsetTop ?? 0),
        ),
      });
    update();
    window.addEventListener("resize", update);
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
    };
  }, [enabled]);

  const maximum = Math.max(0, viewport.height - 16);
  const minimum = Math.min(200, maximum);
  const clamp = (value: number) => Math.max(minimum, Math.min(maximum, value));
  const finish = () => {
    drag.current = null;
    setResizing(false);
  };
  return {
    resizing,
    style: enabled
      ? ({
          "--drawer-available-height": `${maximum}px`,
          bottom: viewport.bottom,
          minHeight: minimum,
          ...(height === undefined ? {} : { height: clamp(height), maxHeight: maximum }),
        } as React.CSSProperties)
      : undefined,
    handleProps: enabled
      ? {
          role: "separator",
          tabIndex: 0,
          "aria-label": "Resize bottom sheet",
          "aria-orientation": "horizontal" as const,
          "aria-valuemin": minimum,
          "aria-valuemax": maximum,
          "aria-valuenow": height === undefined ? undefined : clamp(height),
          "aria-hidden": false,
          "data-base-ui-swipe-ignore": "",
          style: { touchAction: "none" },
          onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            drag.current = {
              pointerId: event.pointerId,
              y: event.clientY,
              height: measure(event.currentTarget),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          },
          onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
            if (drag.current?.pointerId !== event.pointerId) return;
            const nextHeight = drag.current.height + drag.current.y - event.clientY;
            if (nextHeight < minimum) {
              finish();
              onClose();
              return;
            }
            setHeight(clamp(nextHeight));
          },
          onPointerUp: finish,
          onPointerCancel: finish,
          onLostPointerCapture: finish,
          onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            setHeight(
              event.key === "Home"
                ? minimum
                : event.key === "End"
                  ? maximum
                  : clamp(measure(event.currentTarget) + (event.key === "ArrowUp" ? 48 : -48)),
            );
          },
        }
      : {},
  };
}

function measure(element: HTMLElement) {
  return element.closest('[data-slot="drawer-popup"]')!.getBoundingClientRect().height;
}
