import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { playClick } from "./sounds";

interface SlideButtonProps {
  onSlideComplete: () => void;
  trackColor: string;
  handleColor: string;
  handleIcon: ReactNode;
  handleShadow?: string;
  trackShadow?: string;
  confirmedTrackColor?: string;
  confirmedTrackShadow?: string;
  confirmedContent?: ReactNode;
  confirmedTransitionMs?: number;
  children: ReactNode;
}

const HANDLE_W = 52;
const HANDLE_H = 50;
const PADDING = 6;

export function SlideButton({
  onSlideComplete,
  trackColor,
  handleColor,
  handleIcon,
  handleShadow,
  trackShadow,
  confirmedTrackColor,
  confirmedTrackShadow,
  confirmedContent,
  confirmedTransitionMs = 100,
  children,
}: SlideButtonProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideXRef = useRef(0);
  const [slideX, setSlideX] = useState(0);
  const startRef = useRef(0);
  const draggingRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const firedRef = useRef(false);
  const [returning, setReturning] = useState(false);

  const getMax = () => {
    if (!trackRef.current) return 0;
    return trackRef.current.offsetWidth - HANDLE_W - PADDING * 2;
  };

  const handleStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (firedRef.current) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setReturning(false);
    startRef.current = e.clientX - slideXRef.current;

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const max = getMax();
      const newX = Math.min(Math.max(0, ev.clientX - startRef.current), max);
      slideXRef.current = newX;
      setSlideX(newX);
      if (confirmedContent && max > 0 && newX >= max * 0.9) {
        playClick();
        setConfirmed(true);
      }
    };

    const onEnd = () => {
      target.releasePointerCapture(e.pointerId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const max = getMax();
      if (max > 0 && slideXRef.current >= max * 0.9) {
        firedRef.current = true;
        setTimeout(() => {
          onSlideComplete();
          setTimeout(() => {
            setReturning(true);
            slideXRef.current = 0;
            setSlideX(0);
            setConfirmed(false);
            firedRef.current = false;
          }, 50);
        }, (confirmedTransitionMs ?? 100) + 50);
      } else {
        setReturning(true);
        slideXRef.current = 0;
        setSlideX(0);
        setConfirmed(false);
      }
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
  };

  return (
    <div
      ref={trackRef}
      className="w-full h-[68px] rounded-[50px] relative select-none touch-none flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: trackColor }}
    >
      {trackShadow && (
        <div
          className="absolute inset-0 pointer-events-none rounded-[inherit]"
          style={{ boxShadow: trackShadow }}
        />
      )}
      <div className="flex items-center gap-2 pointer-events-none">
        {children}
      </div>
      <div
        className="absolute top-[9px] z-10 rounded-[50px] cursor-grab active:cursor-grabbing touch-none"
        style={{
          left: `${PADDING + slideX}px`,
          width: `${HANDLE_W}px`,
          height: `${HANDLE_H}px`,
          backgroundColor: handleColor,
          boxShadow: handleShadow,
          transition: returning ? "left 200ms ease-out" : "none",
        }}
        onPointerDown={handleStart}
        onTransitionEnd={() => setReturning(false)}
      >
        <div className="absolute left-[14px] top-[16px] w-6 h-5 flex items-center justify-center">
          {handleIcon}
        </div>
      </div>
      {confirmedContent && (
        <div
          className="absolute inset-0 rounded-[inherit] flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: confirmedTrackColor ?? handleColor,
            boxShadow: confirmedTrackShadow ?? "none",
            opacity: confirmed ? 1 : 0,
            visibility: confirmed ? "visible" : "hidden",
            transition: `opacity ${confirmedTransitionMs}ms ease-in-out`,
          }}
        >
          <div className="flex items-center gap-2">{confirmedContent}</div>
        </div>
      )}
    </div>
  );
}
