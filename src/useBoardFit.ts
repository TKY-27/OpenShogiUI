import { useLayoutEffect, type RefObject } from "react";

/** Measure chrome, never scale the board: DOM cells and pointer coordinates stay identical. */
export function useBoardFit(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface || !active) return;
    // Setup can be scrolled; starting a game reveals both clocks from the top.
    surface.parentElement?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    let frame = 0;
    const measure = () => {
      const board = surface.querySelector<HTMLElement>(
        ".board-coordinate-grid",
      );
      if (!board) return;
      const rect = surface.getBoundingClientRect();
      const overhead = rect.height - board.getBoundingClientRect().height;
      const viewport = Math.min(
        window.visualViewport?.height ?? window.innerHeight,
        document.querySelector(".app-main")?.getBoundingClientRect().bottom ??
          Infinity,
      );
      const safe =
        Number.parseFloat(getComputedStyle(surface).paddingBottom) || 0;
      const available = Math.floor(
        viewport -
          (rect.top +
            window.scrollY +
            (surface.parentElement?.scrollTop ?? 0)) -
          overhead -
          safe -
          8,
      );
      // 24px cells at the floor; short/zoomed/landscape screens scroll instead of clipping.
      const coordinates =
        board.querySelector(".rank-coordinates")?.getBoundingClientRect()
          .width ?? 18;
      const size = Math.max(220 + coordinates, available);
      if (surface.style.getPropertyValue("--fit-board-size") !== `${size}px`)
        surface.style.setProperty("--fit-board-size", `${size}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(surface);
    for (const node of document.querySelectorAll(
      ".app-bar,.match-clock,.hand-stand,.match-controls",
    ))
      observer.observe(node);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [ref, active]);
}
