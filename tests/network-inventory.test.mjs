import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../component/WorkspaceGraph.tsx", import.meta.url), "utf8");

test("le composant embarqué ne crée ni iframe ni appel réseau", () => {
  assert.doesNotMatch(component, /<iframe|createElement\(["']iframe|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/i);
  assert.doesNotMatch(component, /:5210|https?:\/\//i);
});

test("le composant consomme la coquille et expose des nœuds accessibles", () => {
  assert.match(component, /export function WorkspaceGraph/);
  assert.match(component, /useDashboardStore/);
  assert.match(component, /state\.projects/);
  assert.match(component, /state\.mindGraph/);
  assert.match(component, /<canvas/);
  assert.match(component, /aria-label="Nœuds du Cortex"/);
  assert.match(component, /onClick=\{\(\) => setSelectedId/);
});
