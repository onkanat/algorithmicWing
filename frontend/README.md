# Frontend quick notes

This small README documents the cinematic UI behaviors and useful shortcuts for local testing.

- Open the demo (from repository root):
  - Start a local server in the repo and point the browser to `frontend/index.html`.
  - Example (from repo root): `python3 -m http.server --directory frontend 5500`
  - Then open: `http://127.0.0.1:5500/index.html?mode=cinematic`

- Cinematic controls
  - The right-side panel contains NACA code and span-morph sliders.
  - Check the `Remove global axes (scene)` checkbox to remove all global axis UI elements created by the normal mode.
  - Keyboard shortcut: press `a` (when focus is not inside a text input) to toggle the same remove/restore action.
  - The HUD at top-left shows whether global axes are currently removed.

- Notes for contributors
  - The cinematic code computes an accurate geometry centroid (vertex-average) for axis placement between mirrored wings.
  - The toggle removes/restores whole top-level UI groups (best-effort). If your scene has non-UI top-level groups with similar names, consider renaming them.
  - For large geometries the centroid computation may be expensive; optimizing to run only on morph changes is recommended.

If you want me to persist the toggle state to the URL or localStorage, or to further optimize centroid updates, tell me and I'll add it.
