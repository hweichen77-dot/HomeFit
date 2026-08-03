import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface DismissableOptions {
  active?: boolean;
  trapFocus?: boolean;
  closeOnOutside?: boolean;
  restoreFocus?: boolean;
}

export function useDismissable<T extends HTMLElement>(
  onClose: () => void,
  { active = true, trapFocus = false, closeOnOutside = false, restoreFocus = true }: DismissableOptions = {},
) {
  const ref = useRef<T>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    openerRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (!trapFocus || e.key !== "Tab" || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(n => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onPointer = (e: PointerEvent) => {
      if (!closeOnOutside || !ref.current) return;
      if (!ref.current.contains(e.target as Node)) closeRef.current();
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    const opener = openerRef.current;
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
      if (restoreFocus && opener?.isConnected) opener.focus();
    };
  }, [active, trapFocus, closeOnOutside, restoreFocus]);

  return ref;
}
