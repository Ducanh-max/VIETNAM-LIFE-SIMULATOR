# Repository instructions for Codex — ĐỜI VIỆT

Read [docs/LANDMARK_VISUAL_QA.md](docs/LANDMARK_VISUAL_QA.md) before editing any 3D landmark, Blender generation script, GLB/GLTF asset, or landmark loader.

## Non-negotiable asset workflow

1. **Reference first.** Ground the geometry in several actual photographs, preferably from different angles, and any independently verified dimensions. Record photo URLs, viewpoints, dates when known, source licensing, and confidence. Do not present guessed roof details as historical facts.
2. **Blockout before details.** Match massing and silhouette in a plain clay render before texturing, tiny ornaments, or polygon optimization.
3. **Side-by-side visual proof.** Deliver aligned comparisons for at least front, side, three-quarter and in-game shoreline views. The comparisons must actually be visible/reviewable and use corresponding angles; listing image paths or descriptions is insufficient.
4. **Approval gate.** Do not replace a live landmark or push model edits directly to `main` before visual review/explicit approval. Work on a feature branch and open a PR with evidence. Never auto-merge an unapproved landmark change.
5. **No false completion.** Passing TypeScript, Blender export, Vite build, checksum, GLB load, and FPS tests proves software integrity, *not* architectural fidelity. Report visual fidelity independently and admit mismatches.
6. **Preserve the game, never visually resurrect rejected models.** Keep map positions, orientation, scales, camera and collision; retain old source assets only in Git history or for offline review. When the owner has selected the Blender GLB, do NOT render a legacy procedural landmark when the GLB is missing, loading or failing. Report the failure visibly and leave that landmark unrendered in the review branch. Do not overwrite original Blender source.
7. **Small iterations.** Fix one landmark at a time. After approval, integrate via `src/world/landmarkAssets.ts`, test WebGL in the relevant gameplay camera, record measured FPS and build commit.

For Tháp Rùa specifically: the rooftop is **not a generic pagoda roof**. Its compact, weathered crowning structure and decorative ridge must be taken from real images; do not infer a four-corner tiled roof just because it sounds Vietnamese. Verify the size of the top room, rhythm and relative width/height of pointed arches, terraces, masonry and island against photos. If the roof silhouette is wrong, stop and correct that **before** polishing materials.

Only mark the task ready for review when the evidence checklist in `docs/LANDMARK_VISUAL_QA.md` is complete. A PR can remain draft until it is.
