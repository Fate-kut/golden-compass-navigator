import { useEffect, useRef } from "react";

export function ParallaxBackground() {
  const px1 = useRef<HTMLDivElement>(null);
  const px2 = useRef<HTMLDivElement>(null);
  const px3 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (px1.current) px1.current.style.transform = `translate(${x * 8}px, ${y * 8}px)`;
      if (px2.current) px2.current.style.transform = `translate(${x * 18}px, ${y * 18}px)`;
      if (px3.current) px3.current.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div ref={px1} className="px-layer px-layer-1" />
      <div ref={px2} className="px-layer px-layer-2" />
      <div ref={px3} className="px-layer px-layer-3" />
    </div>
  );
}
