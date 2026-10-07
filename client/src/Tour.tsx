import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface TourStep {
  selector: string;
  title: string;
  body: string;
  accent: string;
}

const TOOLTIP_WIDTH = 296;
// A generous estimate, not a pixel-perfect one — only used to keep the
// tooltip clamped inside the viewport, so slightly over/underestimating its
// real (copy-dependent) rendered height just leaves a bit of extra margin
// rather than causing any visible misplacement.
const TOOLTIP_HEIGHT_ESTIMATE = 180;
const GAP = 14;
const PAD = 6;

// Steps whose target element isn't in the DOM right now (an empty state, no
// worklogs logged this week, no Google Calendar connected, etc.) are silently
// dropped rather than shown broken — every page's steps array can freely
// reference conditionally-rendered elements without special-casing them.
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [resolvedSteps] = useState(() => steps.filter((s) => document.querySelector(s.selector)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = resolvedSteps[index] as TourStep | undefined;

  useEffect(() => {
    if (resolvedSteps.length === 0) onClose();
    // Only ever needs to run once, at mount — see resolvedSteps' own comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!step) return;
    function place() {
      const el = document.querySelector(step!.selector);
      if (!el) return;
      // Scroll must finish before measuring — measuring first and scrolling
      // after leaves the highlight/tooltip glued to the pre-scroll viewport
      // position, so they visually drift onto whatever ends up there once
      // an async smooth-scroll catches up. Instant scroll applies
      // synchronously, so the very next getBoundingClientRect() already
      // reflects the settled position.
      el.scrollIntoView({ block: "center", behavior: "auto" });
      setRect(el.getBoundingClientRect());
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step]);

  function next() {
    setIndex((i) => {
      if (i >= resolvedSteps.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }

  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // next/back only ever use the functional setIndex form, so they behave
  // identically regardless of the render they were created in — safe to
  // depend on just resolvedSteps.length/onClose instead of re-subscribing
  // every time `index` changes.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSteps.length, onClose]);

  if (!step || !rect) return null;

  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - TOOLTIP_WIDTH - 16);

  // Always resolve to a single clamped `top` (never a `top`/`bottom` split)
  // — a target taller than the viewport itself (e.g. the whole quadrant
  // grid on Matrix) has neither a "below" nor an "above" with real room, and
  // computing an unclamped `bottom` for that case could push the tooltip
  // off the top of the screen entirely. Preferring below, then above, then
  // just pinning near the top keeps it on-screen regardless of how big or
  // oddly-positioned the target is.
  let top: number;
  if (window.innerHeight - rect.bottom > TOOLTIP_HEIGHT_ESTIMATE + GAP) {
    top = rect.bottom + GAP;
  } else if (rect.top > TOOLTIP_HEIGHT_ESTIMATE + GAP) {
    top = rect.top - TOOLTIP_HEIGHT_ESTIMATE - GAP;
  } else {
    top = 16;
  }
  top = Math.min(Math.max(top, 16), window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - 16);

  return (
    <>
      <div
        className="pointer-events-none fixed z-50 rounded-lg outline-2 outline-offset-[3px] transition-[top,left,width,height] duration-200"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          outlineColor: step.accent,
          boxShadow: "0 0 0 9999px var(--tour-scrim)",
        }}
      />
      <Card
        className="fixed z-50 gap-3 px-4 py-3.5 shadow-lg"
        style={{ width: TOOLTIP_WIDTH, left, top }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: step.accent }} />
          {step.title}
        </div>
        <p className="text-sm text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {index + 1} of {resolvedSteps.length}
          </span>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={next} autoFocus>
              {index === resolvedSteps.length - 1 ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </Card>
      <button
        type="button"
        onClick={onClose}
        className="fixed top-3 right-4 z-50 text-xs text-muted-foreground hover:text-foreground"
      >
        Press Esc to skip
      </button>
    </>
  );
}
