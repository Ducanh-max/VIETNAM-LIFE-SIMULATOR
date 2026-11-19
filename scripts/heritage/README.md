# Rebuild user-supplied heritage review assets

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
