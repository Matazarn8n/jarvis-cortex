import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../component/", import.meta.url);
const files = [
  "WorkspaceGraph.tsx",
  "WorkspaceGraph.css",
  ...(await readdir(new URL("legacy/", root))).map((name) => `legacy/${name}`),
];
const sources = await Promise.all(
  files.map(async (name) => [
    name,
    await readFile(new URL(name, root), "utf8"),
  ]),
);
const joined = sources
  .map(([name, body]) => `\n/* ${name} */\n${body}`)
  .join("");

test("inventaire réseau: une porte produit same-origin, aucun ancien serveur ni CDN", () => {
  const component = sources.find(([name]) => name === "WorkspaceGraph.tsx")[1];
  assert.equal((joined.match(/\bfetch\s*\(/g) ?? []).length, 1);
  assert.match(component, /fetch\(\s*path,\s*\{\s*credentials: "include"/);
  assert.match(component, /"\/api\/hermes-projects"/);
  assert.doesNotMatch(
    joined,
    /:5210|https?:\/\/|XMLHttpRequest|WebSocket|EventSource/i,
  );
  assert.doesNotMatch(joined, /globalThis|import\s*\(/);
  assert.doesNotMatch(joined, /createElement\(\s*[^'"]/);
  const createdTags = [
    ...joined.matchAll(/createElement\(\s*(['"])([^'"]+)\1/g),
  ].map((match) => match[2]);
  assert.deepEqual([...new Set(createdTags)].sort(), [
    "button",
    "canvas",
    "div",
    "label",
  ]);
});

test("montage composant: actifs historiques complets, aucun browsing context", () => {
  const component = sources.find(([name]) => name === "WorkspaceGraph.tsx")[1];
  assert.doesNotMatch(
    joined,
    /<iframe|createElement\(["']iframe|<object|<embed/i,
  );
  assert.match(joined, /function setLayout/);
  assert.match(joined, /{ v: 'rings', label: 'Rings' }/);
  assert.match(joined, /{ v: 'deck', label: 'Deck' }/);
  assert.match(joined, /function openViewer/);
  assert.match(joined, /function flyToNode/);
  assert.match(joined, /function buildPanels/);
  assert.match(joined, /function destroy/);
  assert.match(joined, /BRAIN_ICON_PATHS/);
  assert.match(joined, /export function WorkspaceGraph/);
  assert.match(joined, /role="dialog"/);
  for (const asset of ["icons", "flows", "core", "skin", "controls"])
    assert.match(component, new RegExp(`import "\\.\\/legacy/${asset}"`));
  assert.match(component, /import "\.\/WorkspaceGraph\.css"/);
  assert.match(
    component,
    /legacy\.BrainCore\.destroy\(\);\s*previousFocus\?\.focus\(\)/,
  );
  assert.match(component, /const escapeHtml =/);
  assert.match(component, /onKeyDown=\{handleKeyDown\}/);
  assert.doesNotMatch(joined, /\.slice\(0,\s*(24|48)\)|operationalCapacity/);
});

test("les nœuds viennent tous du vault authentifié et leurs ids sont dédupliqués", () => {
  const component = sources.find(([name]) => name === "WorkspaceGraph.tsx")[1];
  assert.match(component, /Promise\.all\(\s*projects\.map/);
  assert.match(component, /\/documents`/);
  assert.match(component, /const ids = new Set<string>\(\)/);
  assert.match(component, /nodes:\s*nodes\s*\.filter/);
  assert.match(component, /onError\(null\)/);
});
