# TinyFish SEO Page Auditor Skill

## Purpose
Audit a public webpage for actionable on-page SEO issues using TinyFish Fetch as the source of truth.

## Tools
Use TinyFish Fetch for the target URL with:
- format: html
- links: true
- image_links: true
- ttl: 0
- purpose: "Audit this page for on-page SEO structure, content, links, headings and images."

Fetch is preferred because the target URL is already known and TinyFish returns structured page metadata plus extracted page content.

## Workflow
1. Validate that the URL is public HTTP/HTTPS.
2. Fetch the page with TinyFish Fetch.
3. Record:
   - final URL after redirects
   - title and title length
   - meta description and length
   - detected language
   - H1 and H2 headings
   - visible word count
   - link count
   - internal vs external links
   - image count and alt coverage when detectable
4. Score the page from 0–100 using explainable rules.
5. Sort recommendations by severity: high, medium, low.
6. Never invent Lighthouse, Core Web Vitals, Search Console, backlink, traffic or indexation data. If those were not measured, say so.
7. Return a concise "fix first" list before detailed observations.

## Suggested scoring
Start at 100 and subtract:
- Missing title: 18
- Missing description: 14
- No H1: 14
- Very thin content (<150 words): 12
- No internal links: 8
- Multiple H1s: 6
- Non-HTTPS: 6
- Weak image alt coverage: 6
- Title/description length issues: 5–7
- Long content with no H2s: 3
- Missing detected language: 3

Clamp to 0–100.

## Output format
### SEO score
NN/100 · Grade A–F

### Fix first
1. [HIGH] Issue — concrete remedy
2. [MEDIUM] Issue — concrete remedy

### Page snapshot
- Title:
- Description:
- H1:
- Internal links:
- External links:
- Images:
- Words:
- Language:
- Final URL:

### Scope note
This is an on-page content/structure audit powered by TinyFish Fetch. It is not a Lighthouse, Core Web Vitals, backlink or Search Console audit.