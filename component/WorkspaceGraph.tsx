import * as d3 from "d3";
import { marked } from "marked";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./legacy/icons";
import "./legacy/flows";
import "./legacy/core";
import "./legacy/skin";
import "./legacy/controls";
import "./WorkspaceGraph.css";

type Project = {
  id: string;
  name: string;
  connector: string;
  manifestState: string;
  createdAt: string;
};
type ProjectDocument = { ref: string; bytes: number };
type LegacyNode = {
  id: string;
  label: string;
  type: "router" | "hub" | "dir" | "file";
  layer: "M";
  dept?: "product";
  hubKind?: "dept";
  path?: string;
  ext?: string;
  desc?: string;
  files?: number;
  mdFiles?: number;
  size?: number;
  mtime?: number;
  expanded?: boolean;
  access: "both";
};
type Graph = {
  meta: {
    totalFiles: number;
    totalNodes: number;
    mdLinks: number;
    scanMs: number;
    hiddenCount: number;
  };
  departments: { key: string; label: string; color: string; icon: string }[];
  layers: { key: string; label: string; color: string; shape: string }[];
  nodes: LegacyNode[];
  links: { s: string; t: string; k: string; w: number }[];
  mdLinks: [string, string][];
};
type CortexSource = {
  graph: () => Promise<Graph>;
  expand: (id: string) => Promise<{ nodes: LegacyNode[] }>;
  search: (query: string) => Promise<{
    results: {
      path: string;
      name: string;
      type: string;
      layer: string;
      dept?: string;
    }[];
  }>;
  file: (path: string) => Promise<{ content?: string; error?: string }>;
  open: (path: string) => Promise<{ ok: boolean; error?: string }>;
  tweak: (change: Record<string, unknown>) => Promise<{ ok: boolean }>;
  bake: (snapshot: unknown) => Promise<{ ok: boolean; path: string }>;
  rescan: () => Promise<{ ok: boolean }>;
};
type LegacyWindow = Window & {
  d3: typeof d3;
  marked: typeof marked;
  BrainCore: {
    boot: (
      skin: unknown,
      source: CortexSource,
      root: HTMLElement,
    ) => Promise<void>;
    destroy: () => void;
    S: { root: HTMLElement };
  };
  BRAIN_SKIN: unknown;
  BRAIN_CONTROLS: () => void;
};

const api = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "x-hermes-origin": "cockpit" },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
};
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character] ?? character,
  );
const basename = (path: string) => path.split("/").pop() || path;
const extension = (path: string) => {
  const match = /(?:^|\/)[^/]+(\.[^./]+)$/.exec(path);
  return match?.[1].toLowerCase() || "";
};

function createSource(onError: (message: string | null) => void): CortexSource {
  let graph: Graph | null = null;
  const content = new Map<string, string>();
  const hidden = new Set<string>();
  const labels = new Map<string, { label?: string; desc?: string }>();
  const checked = async <T,>(request: Promise<T>) => {
    try {
      return await request;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Cortex indisponible");
      throw cause;
    }
  };

  const load = async (): Promise<Graph> => {
    const started = performance.now();
    const { projects } = await checked(
      api<{ projects: Project[] }>("/api/hermes-projects"),
    );
    const records = await Promise.all(
      projects.map(async (project) => ({
        project,
        documents: (
          await checked(
            api<{ documents: ProjectDocument[] }>(
              `/api/hermes-projects/${encodeURIComponent(project.id)}/documents`,
            ),
          )
        ).documents,
      })),
    );
    const nodes: LegacyNode[] = [
      {
        id: "CLAUDE.md",
        label: "Vault",
        type: "router",
        layer: "M",
        path: "CLAUDE.md",
        desc: "Vault du compte authentifié",
        size: 0,
        mtime: Date.now(),
        access: "both",
      },
      {
        id: "hub:product",
        label: "Projects",
        type: "hub",
        hubKind: "dept",
        dept: "product",
        layer: "M",
        access: "both",
      },
    ];
    const links = [{ s: "CLAUDE.md", t: "hub:product", k: "route", w: 1 }];
    content.set(
      "CLAUDE.md",
      `# Vault\n\n${projects.length} projet(s) visible(s) pour ce compte.`,
    );
    for (const { project, documents } of records) {
      const projectName = escapeHtml(project.name);
      const projectId = `project:${project.id}`;
      nodes.push({
        id: projectId,
        label: projectName,
        type: "dir",
        dept: "product",
        layer: "M",
        path: projectId,
        files: documents.length,
        mdFiles: documents.filter((document) => document.ref.endsWith(".md"))
          .length,
        size: documents.reduce((sum, document) => sum + document.bytes, 0),
        mtime: Date.parse(project.createdAt),
        expanded: true,
        desc: `${escapeHtml(project.connector)} · ${escapeHtml(project.manifestState)}`,
        access: "both",
      });
      links.push({ s: "hub:product", t: projectId, k: "spoke", w: 1 });
      content.set(
        projectId,
        `# ${projectName}\n\nConnecteur : ${escapeHtml(project.connector)}\n\nÉtat : ${escapeHtml(project.manifestState)}\n\n${documents.length} document(s).`,
      );
      for (const document of documents) {
        const documentRef = escapeHtml(document.ref);
        const documentName = escapeHtml(basename(document.ref));
        const id = `document:${project.id}:${encodeURIComponent(document.ref)}`;
        nodes.push({
          id,
          label: documentName,
          type: "file",
          dept: "product",
          layer: "M",
          path: id,
          ext: extension(document.ref),
          desc: `${documentRef} · ${document.bytes} octets`,
          size: document.bytes,
          mtime: Date.parse(project.createdAt),
          access: "both",
        });
        links.push({ s: projectId, t: id, k: "spoke", w: 1 });
        content.set(
          id,
          `# ${documentName}\n\nChemin : ${documentRef}\n\nTaille : ${document.bytes} octets\n\nProjet : ${projectName}`,
        );
      }
    }
    const ids = new Set<string>();
    graph = {
      meta: {
        totalFiles: records.reduce(
          (sum, item) => sum + item.documents.length,
          0,
        ),
        totalNodes: nodes.length,
        mdLinks: 0,
        scanMs: Math.round(performance.now() - started),
        hiddenCount: hidden.size,
      },
      departments: [
        { key: "product", label: "Projects", color: "#56d97a", icon: "folder" },
      ],
      layers: [
        { key: "M", label: "Memory", color: "#8fa3ad", shape: "circle" },
        { key: "S", label: "Skills", color: "#ff6b1a", shape: "diamond" },
        { key: "R", label: "Routines", color: "#b47aff", shape: "hex" },
        { key: "A", label: "Applications", color: "#2196f3", shape: "square" },
      ],
      nodes: nodes
        .filter(
          (node) =>
            !ids.has(node.id) && ids.add(node.id) && !hidden.has(node.id),
        )
        .map((node) => ({ ...node, ...labels.get(node.id) })),
      links,
      mdLinks: [],
    };
    onError(null);
    return graph;
  };

  return {
    graph: async () => graph ?? load(),
    expand: async () => ({ nodes: [] }),
    search: async (query) => {
      const current = graph ?? (await load());
      const needle = query.toLocaleLowerCase();
      return {
        results: current.nodes
          .filter((node) =>
            `${node.label} ${node.desc ?? ""}`
              .toLocaleLowerCase()
              .includes(needle),
          )
          .map((node) => ({
            path: node.id,
            name: node.label,
            type: node.type,
            layer: node.layer,
            dept: node.dept,
          })),
      };
    },
    file: async (path) => ({
      content: content.get(path) ?? "Contenu indisponible.",
    }),
    open: async () => ({
      ok: false,
      error: "Ouverture locale indisponible dans la coquille web",
    }),
    tweak: async (change) => {
      const id = typeof change.id === "string" ? change.id : "";
      if (change.action === "hide") hidden.add(id);
      if (change.action === "unhide-all") hidden.clear();
      if (change.action === "edit")
        labels.set(id, {
          label: escapeHtml(String(change.label ?? "")),
          desc: escapeHtml(String(change.desc ?? "")),
        });
      graph = null;
      return { ok: true };
    },
    bake: async () => ({ ok: true, path: "clipboard" }),
    rescan: async () => {
      graph = null;
      return { ok: true };
    },
  };
}

export function WorkspaceGraph({
  onClose,
  onCtrlWheel,
}: {
  onClose: () => void;
  onCtrlWheel?: (deltaY: number, at: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const source = useMemo(() => createSource(setError), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const legacy = window as unknown as LegacyWindow;
    legacy.d3 = d3;
    legacy.marked = marked;
    void legacy.BrainCore.boot(legacy.BRAIN_SKIN, source, root)
      .then(() => legacy.BRAIN_CONTROLS())
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Cortex indisponible",
        ),
      );
    closeRef.current?.focus();
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !onCtrlWheel) return;
      onCtrlWheel(event.deltaY, performance.timeOrigin + event.timeStamp);
    };
    root.addEventListener("wheel", wheel, { passive: true });
    return () => {
      root.removeEventListener("wheel", wheel);
      legacy.BrainCore.destroy();
      previousFocus?.focus();
    };
  }, [onCtrlWheel, source]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1] ?? first;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="cortex-root"
      role="dialog"
      aria-modal="true"
      aria-label="Cortex"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={closeRef}
        type="button"
        className="cortex-close"
        onClick={onClose}
        aria-label="Fermer le Cortex"
      >
        ×
      </button>
      {error ? (
        <p className="cortex-error" role="alert">
          Données du Cortex indisponibles : {error}
        </p>
      ) : null}
    </div>
  );
}
