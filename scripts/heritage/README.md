# Rebuild user-supplied heritage review assets

Use Blender 5.3 and the original `HoGuom_NgocSon_Heritage_v2_DaTo.blend` as input. Keep that file outside Git. Both scripts disable auto-execution and never save over the source.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\analyze.py
& 'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe' --background --disable-autoexec 'PATH\TO\HoGuom_NgocSon_Heritage_v2_DaTo.blend' --python scripts\heritage\optimize.py
```

`analyze.py` writes `heritage-work/heritage-inventory.json`. `optimize.py` writes `heritage-work/heritage-optimized-working.blend`, `heritage-work/summary.json` and the two review GLBs in `public/models/review/`. `heritage-work/` is Git-ignored. Rebuilding uses no external asset source. The original file and its companion 891 MB GLB are not committed.
