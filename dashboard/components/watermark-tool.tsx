"use client";

import { useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";

/**
 * Draw a box over the watermark, blur it, download the result. Deliberately its own
 * standalone tool rather than plugged into the composer/library data model — nothing here
 * is saved as an asset; upload, mark, process, download.
 *
 * The box is tracked in DISPLAYED pixel coordinates while dragging (matches what the owner
 * sees), then converted to the media's NATURAL pixel dimensions only at submit time, via
 * the <img>/<video> element's own naturalWidth/videoWidth — the server has no idea how big
 * this browser happened to render the preview.
 */
export function WatermarkTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setPreviewUrl(null);
    setMediaKind(null);
    setBox(null);
    setDragStart(null);
    setError(null);
    setResultUrl(null);
  }

  function onPickFile(f: File | null) {
    reset();
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setMediaKind(f.type.startsWith("video/") ? "video" : "image");
  }

  function pointFromEvent(e: React.MouseEvent): { x: number; y: number } | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - r.left, r.width)),
      y: Math.max(0, Math.min(e.clientY - r.top, r.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    const p = pointFromEvent(e);
    if (!p) return;
    setDragStart(p);
    setBox({ x: p.x, y: p.y, width: 0, height: 0 });
    setResultUrl(null);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragStart) return;
    const p = pointFromEvent(e);
    if (!p) return;
    setBox({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      width: Math.abs(p.x - dragStart.x),
      height: Math.abs(p.y - dragStart.y),
    });
  }

  function onMouseUp() {
    setDragStart(null);
  }

  async function submit() {
    if (!file || !box || box.width < 4 || box.height < 4) return;
    const container = containerRef.current;
    if (!container) return;
    const displayed = container.getBoundingClientRect();

    // Natural size differs by media kind — an <img> reports it directly, a <video>
    // reports it as videoWidth/videoHeight only once metadata has loaded (guaranteed by
    // this point, since the box could only be drawn on top of an already-rendered element).
    const naturalW = mediaKind === "image" ? imgRef.current?.naturalWidth : videoRef.current?.videoWidth;
    const naturalH = mediaKind === "image" ? imgRef.current?.naturalHeight : videoRef.current?.videoHeight;
    if (!naturalW || !naturalH) {
      setError("Não foi possível ler as dimensões desse arquivo.");
      return;
    }
    const scaleX = naturalW / displayed.width;
    const scaleY = naturalH / displayed.height;

    setBusy(true);
    setError(null);
    setResultUrl(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("x", String(Math.round(box.x * scaleX)));
      fd.set("y", String(Math.round(box.y * scaleY)));
      fd.set("width", String(Math.round(box.width * scaleX)));
      fd.set("height", String(Math.round(box.height * scaleY)));

      const res = await fetch("/api/tools/watermark", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível processar esse arquivo.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/.exec(disposition);
      setResultName(match ? decodeURIComponent(match[1]) : `sem-marca-${file.name}`);
      setResultUrl(URL.createObjectURL(blob));
    } catch {
      setError("A conexão caiu antes de terminar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface p-5">
        <label className="mb-1 block text-xs font-medium text-ink-soft">
          Foto ou vídeo
        </label>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface"
        />
        <p className="mt-2 text-xs text-muted">
          JPEG, PNG, WebP, MP4 ou MOV. Desenhe um retângulo sobre a marca d&apos;água — a
          região marcada é coberta com um borrão forte, o resto do arquivo não é tocado.
        </p>
      </div>

      {previewUrl ? (
        <div className="rounded-card border border-border bg-surface p-5">
          <div
            ref={containerRef}
            className="relative inline-block max-w-full cursor-crosshair select-none"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {mediaKind === "image" ? (
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Pré-visualização"
                className="block max-h-[70vh] max-w-full"
                draggable={false}
              />
            ) : (
              <video
                ref={videoRef}
                src={previewUrl}
                className="block max-h-[70vh] max-w-full"
                muted
                playsInline
                preload="metadata"
              />
            )}
            {box ? (
              <div
                className="pointer-events-none absolute border-2 border-brand bg-brand/20"
                style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              />
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">
            Clique e arraste sobre a imagem{mediaKind === "video" ? " (usa o primeiro quadro do vídeo)" : ""} para marcar a área.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !box || box.width < 4 || box.height < 4}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
            >
              {busy ? "Processando…" : "Remover marca d'água"}
            </button>
            {resultUrl ? (
              <a
                href={resultUrl}
                download={resultName}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                Baixar resultado
              </a>
            ) : null}
          </div>
          {error ? <p className="mt-3 text-sm text-status-failed">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
