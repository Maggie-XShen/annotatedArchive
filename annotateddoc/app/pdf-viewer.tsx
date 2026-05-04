"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type RecordEntry = {
  id: number;
  firstName: string;
  lastName: string;
  age: number | string;
  buyer: string;
  spouseId?: number;
  fatherId?: number;
  motherId?: number;
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
  const [records, setRecords] = useState<RecordEntry[]>([]);

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
    let isDisposed = false;

    const loadRecords = async () => {
      try {
        const response = await fetch("/records.json");
        if (!response.ok) {
          throw new Error(`Failed to load records.json (${response.status})`);
        }
        const data = (await response.json()) as RecordEntry[];
        if (!isDisposed) {
          setRecords(data);
        }
      } catch {
        // Records are optional; the viewer still works without them.
      }
    };

    void loadRecords();

    return () => {
      isDisposed = true;
    };
  }, []);

  const recordsById = useMemo(() => {
    const map = new Map<number, RecordEntry>();
    for (const record of records) {
      map.set(record.id, record);
    }
    return map;
  }, [records]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<number, RecordEntry[]>();
    for (const record of records) {
      for (const parentId of [record.fatherId, record.motherId]) {
        if (parentId === undefined) continue;
        const list = map.get(parentId) ?? [];
        list.push(record);
        map.set(parentId, list);
      }
    }
    return map;
  }, [records]);

  const describeRelation = (relatedId: number | undefined) => {
    if (relatedId === undefined) return null;
    const related = recordsById.get(relatedId);
    if (!related) return `id:${relatedId}`;
    return `${related.firstName} (id:${related.id})`;
  };

  const buildFamilyStatus = (record: RecordEntry): string[] => {
    const lines: string[] = [];
    const spouse = describeRelation(record.spouseId);
    if (spouse) lines.push(`Spouse: ${spouse}`);
    const father = describeRelation(record.fatherId);
    if (father) lines.push(`Father: ${father}`);
    const mother = describeRelation(record.motherId);
    if (mother) lines.push(`Mother: ${mother}`);
    const children = childrenByParentId.get(record.id);
    if (children && children.length > 0) {
      const list = children.map((child) => `${child.firstName} (id:${child.id})`).join(", ");
      lines.push(`Children: ${list}`);
    }
    return lines;
  };

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

              {archiveAnnotations.annotations.map((annotation, index) => {
                const record = records[index];
                const POPUP_WIDTH = 256;
                const POPUP_HEIGHT_ESTIMATE = 240;
                const POPUP_GAP = 8;
                const placeLeft =
                  annotation.x + annotation.width + POPUP_GAP + POPUP_WIDTH >
                  archiveAnnotations.width;
                const placeAbove =
                  annotation.y + POPUP_HEIGHT_ESTIMATE > archiveAnnotations.height;
                const popupStyle: React.CSSProperties = {
                  width: POPUP_WIDTH,
                  ...(placeLeft
                    ? { right: annotation.width + POPUP_GAP }
                    : { left: annotation.width + POPUP_GAP }),
                  ...(placeAbove
                    ? { bottom: 0 }
                    : { top: 0 }),
                };
                return (
                  <div
                    key={annotation.id}
                    className="group absolute border border-transparent bg-transparent transition-colors duration-150 hover:border-[#9d2b25] hover:bg-[#c44b3d]/10"
                    style={{
                      left: annotation.x,
                      top: annotation.y,
                      width: annotation.width,
                      height: annotation.height,
                    }}
                    aria-label={annotation.name}
                  >
                    <span className="pointer-events-none absolute -top-6 left-0 hidden whitespace-nowrap rounded bg-[#9d2b25] px-1.5 py-0.5 text-[10px] font-medium text-[#fff7ef] shadow-sm group-hover:block">
                      {annotation.name}
                    </span>
                    {record && (
                      <div
                        className="pointer-events-none absolute z-10 hidden rounded-md border border-[#9d2b25] bg-[#fff7ef] p-3 text-left text-[12px] leading-snug text-[#16120f] shadow-lg group-hover:block"
                        style={popupStyle}
                      >
                        <h2 className="mb-2 text-[13px] font-semibold tracking-tight">
                          Record #{record.id}
                        </h2>
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                          <dt className="font-medium text-[#6a5b4e]">ID</dt>
                          <dd>{record.id}</dd>
                          <dt className="font-medium text-[#6a5b4e]">First name</dt>
                          <dd>{record.firstName || "—"}</dd>
                          <dt className="font-medium text-[#6a5b4e]">Last name</dt>
                          <dd>{record.lastName || "—"}</dd>
                          <dt className="font-medium text-[#6a5b4e]">Family status</dt>
                          <dd>
                            {(() => {
                              const lines = buildFamilyStatus(record);
                              if (lines.length === 0) return "—";
                              return (
                                <div className="flex flex-col gap-0.5">
                                  {lines.map((line) => (
                                    <span key={line}>{line}</span>
                                  ))}
                                </div>
                              );
                            })()}
                          </dd>
                          <dt className="font-medium text-[#6a5b4e]">Age</dt>
                          <dd>{record.age}</dd>
                          <dt className="font-medium text-[#6a5b4e]">Location</dt>
                          <dd>{annotation.name}</dd>
                          <dt className="font-medium text-[#6a5b4e]">Buyer</dt>
                          <dd>{record.buyer || "—"}</dd>
                        </dl>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
