"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

export default function Home() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "0") {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const zoomAtPoint = (nextScale: number, clientX: number, clientY: number) => {
    const stage = stageRef.current;

    if (!stage) {
      setScale(nextScale);
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;

    setOffset((currentOffset) => {
      const scaleRatio = nextScale / scale;
      return {
        x: pointX - (pointX - currentOffset.x) * scaleRatio,
        y: pointY - (pointY - currentOffset.y) * scaleRatio,
      };
    });
    setScale(nextScale);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * zoomFactor));

    zoomAtPoint(nextScale, event.clientX, event.clientY);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
    setIsDragging(true);

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    setOffset({
      x: dragStateRef.current.startOffsetX + deltaX,
      y: dragStateRef.current.startOffsetY + deltaY,
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragStateRef.current.active = false;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#f3efe6] text-[#16120f]">
      <header className="flex shrink-0 flex-col items-center gap-3 px-6 pt-8 text-center sm:px-10 sm:pt-10">
        <h1 className="max-w-5xl text-balance text-2xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Annotated Census of People to be Sold in 1838
        </h1>
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#6a5b4e] sm:text-base">
          HIST 1801 Final Project by Maggie Shen.
        </p>
      </header>

      <section className="flex flex-1 px-3 pb-3 pt-5 sm:px-6 sm:pb-6">
        <div
          ref={stageRef}
          className="relative flex h-full min-h-0 w-full overflow-hidden rounded-[2rem] border border-black/10 bg-[#e6ddcf] shadow-[0_30px_90px_rgba(59,41,17,0.18)]"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            touchAction: "none",
            cursor: isDragging ? "grabbing" : "grab",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 origin-center will-change-transform"
            style={{
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            <Image
              src="/doc.jpg"
              alt="Annotated census document"
              width={1800}
              height={2400}
              priority
              draggable={false}
              className="pointer-events-none select-none max-w-none"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
