# Optional CLAUDE.md wiring (install only if the workspace fits)

Add these two blocks to the user's CLAUDE.md, adjusting `<repo>` to this folder's path. Only do this when the user keeps (or has just adopted) an index-based memory convention - one fact per file plus a loaded index.

## Finding things (add to their search-routing section)

```
- **brain recall FIRST (MANDATORY for stored facts)** - when the user asks about a stored fact
  (decisions, prices, dates, preferences, settings, "what did we decide about X"), your FIRST
  tool call is `node <repo>/brain.js recall "question"` via Bash - before any Read or Grep.
  Answer from its output, citing the file; open the file it names only if the slice isn't
  enough. `node <repo>/brain.js ask "question"` builds the one-turn prompt (evidence attached)
  and copies it to the clipboard - brain.js itself never invokes any API. If recall misses,
  fall through to grep.
```

## Saving facts (add to their memory section)

```
**Saving facts (default):** `node <repo>/brain.js store "fact" --type feedback|project|user|reference --name slug`
- writes the convention-correct memory file + the index line in one step, zero exploration
reads. Hand-write only when a memory needs rich structure (Why / How-to-apply, links).
```
