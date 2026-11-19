# Rebuild user-supplied heritage review assets

Use Blender 5.3 and the original `HoGuom_NgocSon_Heritage_v2_DaTo.blend` as input. Keep that file outside Git. Both scripts disable auto-execution and never save over the source.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\analyze.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\optimize.py
```

Then export the temple architecture alone for the game:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec heritage-work\heritage-optimized-working.blend --python scripts\heritage\export-game-temple.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec heritage-work\heritage-optimized-working.blend --python scripts\heritage\export-game-bridge.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec --python scripts\heritage\render-bridge-comparison.py
```

`analyze.py` writes `heritage-work/heritage-inventory.json`. `optimize.py` writes `heritage-work/heritage-optimized-working.blend`, `heritage-work/summary.json`, `public/models/thap-rua-heritage.glb` and `public/models/review/ngoc-son-the-huc-review.glb`. `export-game-temple.py` writes `public/models/den-ngoc-son-heritage.glb`, excluding the source bridge and rotating/scaling the source architecture for the island. `export-game-bridge.py` writes `public/models/cau-the-huc-heritage.glb`: it selects the red structure, planks and bridge-only wood faces, edits the source Blender mesh cross section in separate deck and railing bands, discards two unrelated timber fragments at the landings, and keeps the bridge arch and length. `heritage-work/` is Git-ignored. Rebuilding uses no external asset source. The original file and its companion 891 MB GLB are not committed.
