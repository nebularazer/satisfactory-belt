import * as React from "react";

/** Keep bottom sheets within the visible viewport above the keyboard. */
export function useDrawerViewport(enabled: boolean) {
  const [viewport, setViewport] = React.useState({ height: window.innerHeight, bottom: 0 });
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

  return enabled
    ? ({
        "--drawer-available-height": `${Math.max(0, viewport.height - 16)}px`,
        bottom: viewport.bottom,
      } as React.CSSProperties)
    : undefined;
}
