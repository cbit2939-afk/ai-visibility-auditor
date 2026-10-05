# AI Visibility Auditor

A competition build for **TinyFish Bounty Drop 001 — SEO Page Auditor**.

AI Visibility Auditor connects three meaningful TinyFish endpoints:

1. **Search API** — measures whether the target page/domain appears for a target query, with rank and snippet context.
2. **Fetch API** — audits what a machine extraction tool can read from the live page: metadata, headings, content depth, links and images.
3. **Agent API** — inspects the initially rendered page in a browser-capable workflow to detect gating and rendering gaps that static extraction can miss.

The result is an explainable **AI Visibility Score**, endpoint subscores, a Search-vs-Readability diagnosis, and prioritized same-day fixes.

## Bounty requirements covered

- Accepts any public URL and an optional target query
- Uses TinyFish Search and Fetch meaningfully
- Adds Agent as a distinct third endpoint
- Audits live pages rather than saved copies
- Reports what AI can and cannot read
- Identifies visibility gaps and concrete fixes
- Includes quick demo targets for several real pages
- Explains exactly how TinyFish is used

## Verified demo

Target: https://www.tinyfish.ai/  
Query: `TinyFish web agents`

Latest successful run:
- Overall AI Visibility Score: **97/100 (A)**
- Search: **100/100**, target visible at **#1**
- Fetch: **95/100**, 827 extractable words, 1 H1
- Agent: **95/100**, rendered page successfully inspected
- Same-day fix surfaced: shorten the 208-character meta description to reduce truncation risk

The Agent confirmed that the main page content is readable without gating and that the rendered page does not materially differ from plain extraction.

## Additional demo targets

- https://en.wikipedia.org/wiki/Search_engine_optimization — query: `search engine optimization`
- https://example.com/ — query: `example domain`

## Run notes

The UI asks the user for a TinyFish API key at runtime. The key is forwarded only for the current request and is not stored by the app.

Search and Fetch are free TinyFish endpoints. Agent may consume TinyFish wallet usage.

## Project structure

- `public/` — static UI
- `api/audit.js` — starts Search, Fetch and Agent audit flow
- `api/agent-status.js` — polls asynchronous TinyFish Agent runs
- `public/SKILL.md` — reusable skill version
- `public/prompt.txt` — standalone prompt version

## Scope

This project does **not** claim Lighthouse, Core Web Vitals, Search Console, backlinks, traffic or indexation data. Its score is a deterministic, explainable audit of search visibility and AI readability.

## Security

No API keys are committed to this repository.
