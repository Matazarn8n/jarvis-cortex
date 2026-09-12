import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore } from "@/store/dashboard";
import "./WorkspaceGraph.css";

type CortexNode = { id: string; label: string; detail: string; kind: "project" | "document" | "memory" };
type Point = CortexNode & { x: number; y: number };

const TAU = Math.PI * 2;

export function WorkspaceGraph({ onClose, onCtrlWheel }: { onClose: () => void; onCtrlWheel?: (deltaY: number, at: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const projects = useDashboardStore((state) => state.projects);
  const mindGraph = useDashboardStore((state) => state.mindGraph);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo<CortexNode[]>(() => {
    const operational: CortexNode[] = [];
    for (const project of projects) {
      operational.push({ id: `project:${project.id}`, label: project.name, detail: project.description || project.path || "Projet", kind: "project" });
      for (const document of project.documents ?? []) {
        operational.push({ id: `document:${project.id}:${document}`, label: document.split("/").pop() || document, detail: document, kind: "document" });
      }
    }
    const memory = (mindGraph?.nodes ?? []).slice(0, 24).map((node) => ({
      id: `memory:${node.id}`, label: node.label, detail: node.file || "Nœud de mémoire", kind: "memory" as const,
    }));
    return [...operational.slice(0, 48 - memory.length), ...memory];
  }, [mindGraph, projects]);

  const points = useMemo<Point[]>(() => nodes.map((node, index) => {
    const ring = 1 + Math.floor(index / 12);
    const slot = index % 12;
    const angle = -Math.PI / 2 + slot / Math.min(12, Math.max(nodes.length, 1)) * TAU + ring * 0.18;
    const radius = Math.min(42, 14 + ring * 9);
    return { ...node, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  }), [nodes]);

  useEffect(() => {
    if (!selectedId && nodes[0]) setSelectedId(nodes[0].id);
    if (selectedId && !nodes.some((node) => node.id === selectedId)) setSelectedId(nodes[0]?.id ?? null);
  }, [nodes, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let animation = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const w = rect.width;
      const h = rect.height;
      context.fillStyle = "#05060d";
      context.fillRect(0, 0, w, h);
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.lineWidth = 0.7;
      for (let x = -20; x < w + 40; x += 35) for (let y = -20; y < h + 40; y += 30) {
        context.beginPath();
        for (let side = 0; side < 6; side++) {
          const a = side * Math.PI / 3;
          const px = x + Math.cos(a) * 20;
          const py = y + Math.sin(a) * 20;
          side ? context.lineTo(px, py) : context.moveTo(px, py);
        }
        context.closePath();
        context.stroke();
      }
      context.strokeStyle = "rgba(255,107,26,.22)";
      for (const point of points) {
        context.beginPath();
        context.moveTo(w / 2, h / 2);
        context.quadraticCurveTo(w / 2 + (point.y - 50) * 1.5, h / 2 - (point.x - 50) * 1.5, point.x / 100 * w, point.y / 100 * h);
        context.stroke();
      }
      const glow = context.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * .18);
      glow.addColorStop(0, `rgba(255,107,26,${.24 + Math.sin(frame / 35) * .04})`);
      glow.addColorStop(1, "rgba(255,107,26,0)");
      context.fillStyle = glow;
      context.beginPath(); context.arc(w / 2, h / 2, Math.min(w, h) * .18, 0, TAU); context.fill();
      frame += 1;
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [points]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const wheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey || !onCtrlWheel) return;
      event.preventDefault();
      event.stopPropagation();
      onCtrlWheel(event.deltaY, performance.timeOrigin + event.timeStamp);
    };
    dialog.addEventListener("wheel", wheel, { passive: false });
    return () => {
      dialog.removeEventListener("wheel", wheel);
      if (dialog.open) dialog.close();
    };
  }, [onCtrlWheel]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  return (
    <dialog ref={dialogRef} className="cortex-overlay" aria-label="Cortex" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <canvas ref={canvasRef} className="cortex-canvas" aria-hidden="true" />
      <header className="cortex-hud">
        <div><strong>ALFRED · CORTEX</strong><small>{nodes.length} nœuds · vault actif</small></div>
        <button type="button" className="cortex-close" onClick={onClose} aria-label="Fermer le Cortex">×</button>
      </header>
      <div className="cortex-nodes" aria-label="Nœuds du Cortex">
        {points.map((node) => (
          <button
            type="button"
            key={node.id}
            className={`cortex-node cortex-node-${node.kind}${node.id === selectedId ? " selected" : ""}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            onClick={() => setSelectedId(node.id)}
            aria-pressed={node.id === selectedId}
          >
            <span />{node.label}
          </button>
        ))}
      </div>
      {selected ? <aside className="cortex-detail" aria-live="polite"><small>{selected.kind}</small><strong>{selected.label}</strong><p>{selected.detail}</p></aside> : <p className="cortex-empty">Le vault ne contient encore aucun nœud.</p>}
    </dialog>
  );
}
