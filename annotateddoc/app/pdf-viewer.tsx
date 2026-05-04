"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type Annotation = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ArchiveAnnotations = {
  width: number;
  height: number;
  annotations: Annotation[];
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const BASE_SCALE = 1;

function parseArchiveAnnotations(xmlText: string): ArchiveAnnotations {
  const parser = new DOMParser();
  const document = parser.parseFromString(xmlText, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Failed to parse archive.xml");
  }

  const width = Number(document.querySelector("size > width")?.textContent);
  const height = Number(document.querySelector("size > height")?.textContent);

  if (!width || !height) {
    throw new Error("archive.xml is missing image dimensions");
  }

  const annotations = Array.from(document.querySelectorAll("object")).map((objectNode, index) => {
    const name = objectNode.querySelector("name")?.textContent?.trim() || `Annotation ${index + 1}`;
    const xmin = Number(objectNode.querySelector("bndbox > xmin")?.textContent);
    const ymin = Number(objectNode.querySelector("bndbox > ymin")?.textContent);
    const xmax = Number(objectNode.querySelector("bndbox > xmax")?.textContent);
    const ymax = Number(objectNode.querySelector("bndbox > ymax")?.textContent);

    if ([xmin, ymin, xmax, ymax].some((value) => Number.isNaN(value))) {
      throw new Error(`archive.xml contains an invalid bounding box at index ${index}`);
    }

    return {
      id: `${name}-${index}`,
      name,
      x: xmin,
      y: ymin,
      width: xmax - xmin,
      height: ymax - ymin,
    };
  });

  return { width, height, annotations };
}

export default function PdfViewer() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [archiveAnnotations, setArchiveAnnotations] = useState<ArchiveAnnotations | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;

    const loadAnnotations = async () => {
      try {
        const response = await fetch("/archive.xml");
        if (!response.ok) {
          throw new Error(`Failed to load archive.xml (${response.status})`);
        }

        const xmlText = await response.text();
        if (!isDisposed) {
          setArchiveAnnotations(parseArchiveAnnotations(xmlText));
        }
      } catch (error) {
        if (!isDisposed) {
          setLoadError(error instanceof Error ? error.message : "Unable to load annotations");
        }
      }
    };

    void loadAnnotations();

    return () => {
      isDisposed = true;
    };
  }, []);

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
  }, [archiveAnnotations]);

  const ratio = zoom / BASE_SCALE;

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

  if (loadError) {
    return (
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#e6ddcf]">
        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <p className="text-center text-sm text-[#6a5b4e]">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#e6ddcf]">
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto px-4 py-4"
        style={{ touchAction: "none" }}
      >
        {!archiveAnnotations ? (
          <p className="text-center text-sm text-[#6a5b4e]">Loading archive annotations...</p>
        ) : (
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
                width: archiveAnnotations.width,
                height: archiveAnnotations.height,
                willChange: "transform",
              }}
              className="relative"
            >
              <Image
                src="/archive.jpg"
                alt="Annotated archive document"
                width={archiveAnnotations.width}
                height={archiveAnnotations.height}
                priority
                draggable={false}
                className="block select-none"
              />

              {archiveAnnotations.annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="group absolute border border-transparent bg-transparent transition-colors duration-150 hover:border-[#9d2b25] hover:bg-[#c44b3d]/10"
                  style={{
                    left: annotation.x,
                    top: annotation.y,
                    width: annotation.width,
                    height: annotation.height,
                  }}
                  title={annotation.name}
                  aria-label={annotation.name}
                >
                  <span className="pointer-events-none absolute -top-6 left-0 hidden whitespace-nowrap rounded bg-[#9d2b25] px-1.5 py-0.5 text-[10px] font-medium text-[#fff7ef] shadow-sm group-hover:block group-focus-within:block">
                    {annotation.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
