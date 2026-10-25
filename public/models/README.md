`tuck.glb` is the approved Blender Tuck (tuck-character-studio Phase 4 baseline, md5 `df90636e237c9e896cce7ea0b72c9345`).
Do not edit it here: re-export it in tuck-character-studio (`scripts/export_tuck.py`) and copy it over; `tests/tuckAsset.test.ts` checks the checksum.
Renderer switch: `NEXT_PUBLIC_TUCK_RENDERER=legacy` at build time, or `?tuck=legacy|glb` in development. See `src/lib/characterConfig.ts`.
