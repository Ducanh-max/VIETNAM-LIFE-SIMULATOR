# Rebuild user-supplied heritage review assets

## Guarded pipeline

Run from the repository in PowerShell. `pipeline.ps1` accepts `-Source` with
the original blend path, `-Blender` with the executable and `-Stage Inspect`,
`Temple` or `Bridge`. The default stage audits the source and reimports the
three current GLBs. Export stages require the separate material-split
`heritage-work/heritage-optimized-working.blend`, configurable with `-Working`.
Original blend files can be stored in the ignored `assets-source/` directory.

The runner compares SHA256 for the original source and approved tower before
and after each invocation. Inventory, import validation, source hashes and
export logs are written into ignored `heritage-work/`. A failed Blender
command stops the runner. A passing audit still requires WebGL screenshots
and visual review before merging the branch.

`temple_finish.py` repairs verified gate sheets and the surveyed hall facade. It removes shallow detached plaster fragments, levels paving at 1.9 m local Z and joins it through the arch. These changes are baked into GLB.
The loader applies no additional repair or paving offset. The exporter saves
`heritage-work/temple-repaired.blend` separately for inspection. Start each
export from the untransformed working file, avoiding double transforms.

The original `optimize.py` below is the historical full-scene preparation
tool. It also exports the tower, so use the guarded single-landmark exporter
for subsequent changes where the tower has already been approved.

Use Blender 5.3 and the original `HoGuom_NgocSon_Heritage_v2_DaTo.blend` as input. Keep that file outside Git. Both scripts disable auto-execution and never save over the source.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\analyze.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\optimize.py
```

From the repository root, run the export for the landmark you are changing. For bridge work with an existing working blend, start at the bridge export command.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec heritage-work\heritage-optimized-working.blend --python scripts\heritage\export-game-temple.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec heritage-work\heritage-optimized-working.blend --python scripts\heritage\export-game-bridge.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec --python-exit-code 1 --python scripts\heritage\check-bridge-surface.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec --python scripts\heritage\render-bridge-comparison.py
```

`analyze.py` writes `heritage-work/heritage-inventory.json`. `optimize.py` writes `heritage-work/heritage-optimized-working.blend`, `heritage-work/summary.json`, `public/models/thap-rua-heritage.glb` and `public/models/review/ngoc-son-the-huc-review.glb`. `export-game-temple.py` writes `public/models/den-ngoc-son-heritage.glb` and aligns the architecture with the island.

`export-game-bridge.py` selects the source red lattice, planks and timber supports and strips unrelated landing fragments. Its helper `bridge_finish.py` fits the original deck and rail elevations, closes the irregular ends with short thresholds, finishes the side boards and embeds grain and seam textures. The output is `public/models/cau-the-huc-heritage.glb`. The original and working Blender files stay on disk outside the repository history.

`check-bridge-surface.py` reimports the exported GLB and casts 13,485 vertical rays through the deck, including both landings. It checks coverage and compares surface heights in the walkable strip with the 2.4 m collision arch. The final export measured a maximum difference of 0.0513 m. This check complements the in-game walk over the bridge. See [bridge QA](../../docs/BRIDGE_INTEGRATION_QA.md) for gameplay results.
