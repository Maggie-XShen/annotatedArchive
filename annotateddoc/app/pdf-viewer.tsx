"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const RENDER_SCALE = 2; // render once at high resolution; CSS transform handles live zoom

export default function PdfViewer() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages],
  );

  useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setContentSize({ width: node.offsetWidth, height: node.offsetHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [numPages]);

  const ratio = zoom / RENDER_SCALE;

  const applyZoom = useCallback((deltaY: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const mouseX = clientX - bounds.left;
    const mouseY = clientY - bounds.top;
    const contentX = viewport.scrollLeft + mouseX;
    const contentY = viewport.scrollTop + mouseY;

    setZoom((currentZoom) => {
      const zoomFactor = deltaY > 0 ? 0.95 : 1.05;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * zoomFactor));

      if (nextZoom === currentZoom) {
        return currentZoom;
      }

      const scaleRatio = nextZoom / currentZoom;

      requestAnimationFrame(() => {
        viewport.scrollLeft = contentX * scaleRatio - mouseX;
        viewport.scrollTop = contentY * scaleRatio - mouseY;
      });

      return Number(nextZoom.toFixed(3));
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      applyZoom(event.deltaY, event.clientX, event.clientY);
    };

    const blockGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    viewport.addEventListener("gesturestart", blockGestureZoom, { passive: false });
    viewport.addEventListener("gesturechange", blockGestureZoom, { passive: false });
    viewport.addEventListener("gestureend", blockGestureZoom, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleNativeWheel);
      viewport.removeEventListener("gesturestart", blockGestureZoom);
      viewport.removeEventListener("gesturechange", blockGestureZoom);
      viewport.removeEventListener("gestureend", blockGestureZoom);
    };
  }, [applyZoom]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#e6ddcf]">
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto px-4 py-4"
        style={{ touchAction: "none" }}
      >
        <Document
          file="/archive.pdf"
          loading={<p className="text-center text-sm text-[#6a5b4e]">Loading archive.pdf...</p>}
          onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
        >
          <div
            className="mx-auto"
            style={{
              width: contentSize.width ? contentSize.width * ratio : undefined,
              height: contentSize.height ? contentSize.height * ratio : undefined,
            }}
          >
            <div
              ref={contentRef}
              style={{
                transform: `scale(${ratio})`,
                transformOrigin: "0 0",
                width: "fit-content",
                willChange: "transform",
              }}
              className="flex flex-col gap-4"
            >
              {pageNumbers.map((pageNumber) => (
                <Page
                  key={pageNumber}
                  pageNumber={pageNumber}
                  scale={RENDER_SCALE}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              ))}
            </div>
          </div>
        </Document>
      </div>
    </div>
  );
}
