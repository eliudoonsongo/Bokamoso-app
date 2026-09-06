# Human Atlas Renderer

Adapted from the user-supplied snapshot of [ashemag/human-atlas](https://github.com/ashemag/human-atlas), inspected September 6, 2026.

The imported modules are `anatomy.ts`, `scene.tsx`, `explosion-layout.ts`, `model-download.ts`, and `pointer-tap.ts`. Original code is MIT licensed by ashemag; the complete license is distributed at `/atlas/HUMAN-ATLAS-LICENSE.txt`. BodyParts3D data is separately CC BY 4.0; attribution is distributed at `/atlas/ATTRIBUTION.md`.

Bokamoso adapts camera framing to an unobscured canvas, adds keyboard-equivalent camera controls, and manages the scene through a lazy Next.js client route. The standalone Vite shell, shadcn components, and optional browser-agent tools are not imported.