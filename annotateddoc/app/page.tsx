"use client";

import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/app/pdf-viewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-sm text-[#6a5b4e]">Loading archive doc viewer...</p>,
});

export default function Home() {
  return (
    <main className="flex h-screen flex-col bg-[#f3efe6] text-[#16120f]">
      <header className="flex shrink-0 flex-col items-center gap-3 px-6 pt-8 text-center sm:px-10 sm:pt-10">
        <h1 className="max-w-5xl text-balance text-2xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Annotated Census of People to be Sold in 1838
        </h1>
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#6a5b4e] sm:text-base">
          HIST 1801 Final Project by Maggie Shen.
        </p>
      </header>

      <section className="flex flex-1 min-h-0">
        <PdfViewer />
      </section>
    </main>
  );
}
