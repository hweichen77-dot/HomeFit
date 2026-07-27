import { useEffect, useRef, useState } from "react";

export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}

export function useIncrementalCount(total: number, batch: number, resetKey: unknown) {
  const [count, setCount] = useState(batch);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setCount(batch); }, [resetKey, batch]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || count >= total) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setCount(c => Math.min(total, c + batch));
      }
    }, { rootMargin: "600px" });
    io.observe(node);
    return () => io.disconnect();
  }, [count, total, batch]);

  return { count, sentinelRef };
}
