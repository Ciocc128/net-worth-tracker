# Impeccable design-system artifacts

How `DESIGN.md`, `.impeccable/design.json` and the mechanical detector fit together. Moved out of
AGENTS.md — it is maintenance knowledge for the design artifacts, not a coding rule.

## Two layers, two owners

- **`DESIGN.md`'s YAML frontmatter is the normative machine-readable layer** — colors, typography,
  `rounded`, spacing, components.
- **`.impeccable/design.json` is an extensions-only sidecar** — tonal ramps, shadows, motion,
  breakpoints, component HTML/CSS snippets, narrative. **The sidecar never redefines a frontmatter
  token**, and its `narrative` is a verbatim mirror of DESIGN.md: never paraphrase it, and never let
  it carry a rule DESIGN.md lacks.

## The detector reads font sizes ONLY from the frontmatter

`detector/design-system.mjs` calls `addTypographySizes(frontmatter.typography)`; from the sidecar it
takes only `colorMeta` and `roundedMeta`. So a `design-system-font-size` finding is **never** fixed by
regenerating the sidecar — the hook's own "run /impeccable document" hint is misleading for that rule.

## Enumerated ramps go in `typography.scale`

A name→size map alongside the named roles, because the frontmatter parser has no list support. This
project's ramp — 9/10/11/12/13/15/22/32/36/40/44/54px — lives there because the named roles alone
cannot express it. The two layers of the same file must agree: the DESIGN.md *body* documented the
Trade Republic scale for months while the frontmatter still said
`display: clamp(1.75rem, 3vw, 2.5rem)`.

32px and 40px are in the ramp because they are genuinely used — they are the hero **overflow
step-down** (AGENTS.md → *Panoramica*), not a scale step to reach for. The frontmatter comment says so.

## Never regenerate `DESIGN.md`

It is hand-maintained and authoritative; CLAUDE.md, AGENTS.md and every `docs/*-prompts.md` cite it.
The impeccable reference forbids a silent overwrite and explicitly supports a **sidecar-only
refresh** — take that path. Extend the frontmatter additively when a real token is missing.

## Before declaring a finding a false positive

Check whether the design system is simply failing to declare a real value. Suppressing via
`ignore-value` is the last resort, not the first.

## Related

- `PRODUCT.md` — durable product truth (users, positioning, evidence, accessibility posture);
  deliberately holds no visual direction.
- `docs/critique-prompts.md` / `docs/audit-prompts.md` — the per-page review prompts, including the
  `Attenzione:` notes about which surfaces have no mechanical safety net.
