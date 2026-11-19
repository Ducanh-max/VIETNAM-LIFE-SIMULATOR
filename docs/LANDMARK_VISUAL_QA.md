# Landmark visual QA gate (ĐỜI VIỆT)

**Purpose:** Prevent architecturally incorrect but technically valid GLB models from reaching production. This is a manual visual-review gate supported by repeatable automated checks, not a guarantee that an AI can certify a historic monument.

## Why the Tháp Rùa models failed

Commits `8065c37` and `789e426` compiled, rendered, and deployed, yet their screenshots do not sufficiently match the actual monument. Both centered work on dimensions, procedural geometry and FPS rather than matched image evidence. The latest render has an overly broad, raised four-corner roof; an exaggerated extra open pavilion and top mass; neat identical arches and uniformly smooth materials. The actual landmark has a distinctive compact, heavily weathered and ornamented crest above smaller upper masonry. **Do not treat "traditional Vietnamese curved roof" as a complete roof specification.**

The previous reference table in `docs/THAP_RUA_REFERENCES.md` records text conclusions but not independently checkable *paired* images; no human image approval is recorded.

## Reference images (links, not republished assets)

Use real photographs first. Source candidates:
- Wikimedia Commons [Turtle Tower category](https://commons.wikimedia.org/wiki/Category:Turtle_Tower) (inspect each photo's viewpoint and license).
- [Turtle Tower by Hanoi/Hoàn Kiếm city tourism portal](https://myhanoi.vn/vi/thaprua) (descriptive dimensions).
- [VietnamNet — architectural features](https://vietnamnet.vn/thap-rua-tai-ho-guom-duoc-xay-dung-khi-nao-2288598.html) (ornate roofline, Gothic-style arches).
- [VietnamNet English — arches and general structure](https://vietnamnet.vn/en/turtle-tower-the-architectural-landmark-of-hoan-kiem-lake-E206914.html).

Reference photo URLs and their use are for research/comparison only. For any image *committed* to the repository or included in the game, check and honor its individual reuse/license requirements.

## The required workflow for EVERY landmark

### Gate A: reference board, BEFORE Blender

- [ ] List at least **3 photographs** showing front/long, short/side and 3/4 angles; record exact source URLs and licenses. Close-up roof photo if the roof drives recognition.
- [ ] Mark the wall extents, floor levels, openings, terrace edges, roof crest and major silhouette on the photos. Distinguish measured facts, visual estimates and unknowns.
- [ ] Define what must look right at **shoreline viewing distance** as well as close-up.
- [ ] Get reviewer approval of the target reference board before sculpting high detail.

### Gate B: CLAY silhouette, BEFORE textures/materials

- [ ] Build a simple neutral-material blockout. Start from facade outline; **do not invent** additional pavilions, roofs, dragon figures or terraces beyond what references support.
- [ ] Capture **long facade**, **short facade**, **3/4 oblique**, and **shoreline game camera** renders. Set camera azimuth/elevation/focal length to approximate the matching reference photo.
- [ ] For each pair, include: original photograph link or licensed thumbnail; 3D render; a silhouette/landmark overlay where permitted; annotated differences.
- [ ] Check roof-to-body height; top-chamber-to-lower-floor relative dimensions; facade opening-to-pillar widths; number/rhythm of arches; terrace depth and prominence; island-to-tower massing.
- [ ] Ask for human acceptance. If any hard-stop feature below fails, redo the clay geometry first.

### Gate C: texturing and asset tests

- [ ] After silhouette approval, apply aged stone, discoloration, masonry wear, roof and openings consistent with photographic evidence. Avoid regular fake noise that makes historic surfaces look newly manufactured.
- [ ] Confirm expected orientation/origin and scale with `docs/ASSETS.md`; 1 game unit = 1 m.
- [ ] Export GLB; verify measured bounds, missing textures, mesh normals, materials, polycount/file size, and actual WebGL render. Preserve earlier models only in version control for reversible review; do not automatically display rejected procedural models as fallback.
- [ ] Test in-game long/side/3/4/shore views at **1920x1080** when environment supports it, on Low/High; record FPS honestly with viewport, DPR, GPU and measurement length.
- [ ] Run TypeScript, map checks and production build; document warnings.

### Gate D: manual approval and deployment

- [ ] Open **draft PR** containing reference board/links, paired render evidence (accessible to reviewer), geometry changes, export stats, WebGL evidence and known limitations.
- [ ] Reviewer explicitly approves the **visual similarity**, not merely the Vercel build.
- [ ] Only then enable/repoint the GLB in the live landmark loader and merge the PR; do not commit directly to `main` for visual changes.
- [ ] After deploy, confirm commit ID, actual GLB bytes, game camera, console and FPS. Revert or disable the asset if clearly wrong.

## Hard-stop criteria: cannot mark visual review as PASS

Any one of:
1. Roof/crest silhouette differs materially from actual photographic outline (e.g. exaggerated pagoda corners or a fabricated large open upper pavilion).
2. Floor spacing and upper vs lower mass proportions do not read like the reference at matched camera angle.
3. Opening shapes/widths/placement or rail/terrace thickness are obviously inconsistent with the real photographs.
4. Landmark is not recognizable from a normal shoreline camera without a label.
5. No actual visually inspectable reference-vs-render comparison is supplied.

Accept stylization and simplification only AFTER these are matched. Pixel-identical photogrammetry is **not** required.

## PR evidence template

- **Target landmark / version:**
- **Real photo source links + viewpoint + licenses:**
- **Measured dimensions and confidence:**
- **Front reference/render:** [links]
- **Side reference/render:** [links]
- **3/4 reference/render:** [links]
- **Shoreline reference/render:** [links]
- **Largest mismatches and what changed:**
- **Reviewer visual approval:** [pending / pass / reject, with notes]
- **GLB bounds, polygon count, material/texture count, bytes:**
- **Build/test + WebGL screenshots and FPS context:**
- **Deployment verification:** [only after approved merge]

**Status for current Tháp Rùa asset from commit `789e426`: VISUAL REVIEW = REJECTED.** This document does not replace or deploy an alternative model; it establishes the approval gate needed before the next rebuild.
