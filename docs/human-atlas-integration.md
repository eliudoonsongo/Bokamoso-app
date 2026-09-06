# Human Atlas In Bokamoso

## Upstream Review

Reviewed the supplied `human-atlas-main` snapshot and the public [Human Atlas repository](https://github.com/ashemag/human-atlas) on September 6, 2026. The review followed the running application from its entry point through UI state, metadata, rendering, picking, asset decoding, conversion, optimization and validation.

Human Atlas is a client-side anatomy explorer, not an anatomy API, assessment engine or curriculum database. It has no required account, AI provider or backend. Its Vite entry mounts a React page; that page controls visibility, selection, isolation, explosion, camera view and rotation. The shadcn/Base UI components are presentation controls, not part of the geometry engine.

| Upstream Area | Behavior And Integration Decision |
| --- | --- |
| `web/main.tsx`, `vite.config.ts` | Vite mounts the standalone page and serves public files. Replaced by Bokamoso's lazy Next.js `/atlas` route. |
| `app/page.tsx` | Systems, presets, search, camera controls, details, loading and credits. Reimplemented using Bokamoso's existing fonts, icons and modal, with notebook actions and mobile panels. |
| `app/anatomy.ts` | Part/concept types, fifteen display systems, source descriptions and default state. Preserved; detailed organ descriptions remain distinct from generic system descriptions. |
| `app/scene.tsx` | Three.js geometry batching, GPU state textures, lighting, camera fitting and picking. Reused and adapted to a separate, unobscured canvas. |
| `app/explosion-layout.ts` | Packs the bounding rectangles of only visible meshes into a nonoverlapping inventory. Preserved. Exploded positions are an inspection layout, not physiological positions. |
| `app/pointer-tap.ts` | Separates taps from dragging, cancelled gestures and multitouch sequences. Preserved. |
| `app/model-download.ts` | Accepts gzip files or HTTP-decompressed payloads without double decoding, and validates the final byte count. Preserved. |
| `app/agent-tools.ts` | Optional WebMCP search and inspection tools. Reviewed but not imported; all student workflows use the visible interface and require no browser-agent capability. |
| `scripts/convert-anatomy.py` | Converts official OBJ coordinates from millimeters/Z-up to meters/Y-up, quantizes normals and preserves source identity. Not rerun; supplied geometry is used unchanged. |
| `scripts/optimize-anatomy.mjs` | Meshoptimizer simplification, preserving each source mesh with a 0.2% relative geometric error limit. Supplied optimized outputs are retained. |
| `scripts/compress-models.mjs` | Produces gzip chunks and records their sizes in the manifest. Both compressed and raw fallback files are shipped. |
| Validation scripts | Verify all mesh buffers, indices, named concepts, exploded packing and tap/search contracts. Both upstream validators passed against the supplied snapshot. |

The atlas has 2,234 distinct source meshes, 3,432 named concepts and 2,288,268 triangles. A concept can group many meshes: the heart concept, for example, selects 83 pieces rather than one combined mesh. A display system is a curated grouping; its mesh count is not a count of all anatomical organs in that system.

## Student Workflow

1. Create or open a notebook whose subject is Life Science, Life Sciences or Biology. Set its grade and module as usual. In Studio, open **Human Atlas**. An existing suite or API key is not required.
2. Choose a study topic: human body, circulation, gaseous exchange, nutrition, excretion, nervous coordination, hormonal control, support and movement, or male reproduction. These are study groupings, not claims of official curriculum alignment.
3. Use the suggested landmarks or search by anatomical name, a source FMA identifier, or supported common terms such as windpipe. Show or hide systems, or use the All, Skeleton and Organs presets.
4. Select a structure on the body or in the search list. Inspect its context, isolate it, change the camera, or expand a compound concept's included pieces. Camera buttons, a native view selector and the explosion slider provide keyboard alternatives to pointer gestures.
5. Answer the topic's investigation questions using course material. Record a personal observation beside the selected structure and save it to the notebook. The saved note includes the concept ID, reference context, the student's observation and attribution.
6. Use **Ask notebook** when notebook sources were selected. The app returns to the same notebook and restores only those still-available source IDs. It prepares a source-grounded question for review without sending it automatically. Normal chat citation checks apply when the student submits it.

On phones, the 3D view, search/layers and study panel are separate views so controls and text do not cover the anatomy. A selected structure is shown in the canvas footer with an Inspect command. Search and reference descriptions remain usable if the browser cannot create a WebGL context.

## Learning Boundaries

- BodyParts3D 4.0 is an adult male reference. It does not include female reproductive anatomy, every human variation or every microscopic structure. Use appropriate additional sources for those topics.
- System colors are illustrative, not tissue colors. Exploding anatomy changes positions for inspection, not to demonstrate a real physical process.
- Only the upstream's explicitly described major organs have an Organ overview. Other selections show a clearly labeled System overview, not an invented structure-specific explanation.
- The atlas is educational, not diagnostic or surgical. Its descriptions and Bokamoso study prompts are not a verified syllabus or a substitute for course sources and educator review.
- Atlas metadata and descriptions are not silently injected into uploaded sources or the AI context. Observations are notes, not new syllabus chapters.
- Browsing, selecting and saving observations never award XP or mark a concept mastered. The existing assessment and progress engine remains authoritative, and the exact six-field generated suite is unchanged.

## Implementation

| Bokamoso Surface | Responsibility |
| --- | --- |
| [Atlas route](../src/app/atlas/page.tsx) | Route metadata and entry point. |
| [Client loader](../src/components/atlas/atlas-client.tsx) | Defers the viewer and Three.js to a client-only route. |
| [Explorer](../src/components/atlas/atlas-explorer.tsx) | Topic, system and camera controls; loading/retry; study UI; notebook-owned note saving; reference scope. |
| [Renderer](../src/vendor/human-atlas/scene.tsx) | Adapted upstream batched rendering, original component geometry for picking, camera framing and resource cleanup. |
| [Study helpers](../src/lib/atlas-study.ts) | Validates the local manifest and geometry ranges, rewrites only known asset paths, resolves topic landmarks and search, and formats attributed observations. |
| [Navigation helpers](../src/lib/atlas-navigation.ts) | Subject eligibility and same-origin notebook/source/question round trips. |
| [Workspace](../src/components/workspace.tsx) | Life Sciences Studio entry and draft-question/source restoration. |
| [Versioned assets](../public/atlas/README.md) | Original manifest, fifteen compressed chunks and fifteen uncompressed fallbacks. |

Rendering merges geometry by chunk and system. Per-part textures carry translation, visibility and selection, avoiding one visible draw call per source mesh. Picking uses the original component geometry after translation; it does not guess the selected anatomy from a screen label. ResizeObserver refits the camera to the actual canvas, without querying another panel's dimensions. Unmounting aborts pending downloads, cancels animation, and disposes controls, textures and geometry.

There is no new database schema. Notebook observations use the existing `/api/notes` ownership checks and whichever storage backend is configured. Standalone visits and non-Life-Sciences/failed notebook contexts cannot save observations. Direct atlas visits do not create a default notebook.

## Assets And Licensing

All 31 manifest/geometry files were compared byte-for-byte with the supplied snapshot. No mesh was removed or reconstructed. The first compressed geometry download is approximately 33 MB, plus the catalog; browsers without DecompressionStream use larger raw binaries. Ordinary notebooks do not request anatomy assets. Versioned files have a one-year immutable cache policy; use a new versioned directory when changing geometry.

The application code is MIT licensed by ashemag. The data is CC BY 4.0, as confirmed by the [official BodyParts3D license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), last updated February 27, 2025. The original [MIT license](../public/atlas/HUMAN-ATLAS-LICENSE.txt) and [dataset attribution](../public/atlas/ATTRIBUTION.md) are bundled and accessible from Source & scope. Preserve both when redistributing. Bokamoso changes the shell, camera fitting and learning connections; source geometry and its existing simplification remain unchanged.

## Verification

```sh
npx tsx --test tests/atlas.test.mjs tests/atlas-navigation.test.mjs
npm run test:e2e -- tests/atlas.spec.ts
npm run typecheck
npm run lint
npm run build
```

Unit checks cover real concept membership, source-only asset paths, byte bounds, valid topic landmarks, search aliases, compound structures, attributed notes, source-selection round trips, gzip decoding, exploded packing and gesture classification. Browser checks load the real mesh buffers and use screenshot pixels to establish that the canvas is nonblank and framed, rather than merely asserting that a canvas element exists.

The browser workflow covers mesh picking, rotation, camera views, zoom, dragging, presets, system toggles, explosion, isolation, saved observations without XP changes, and a source-preserving return that makes no AI call. Responsive checks cover 1440x900, 390x844, 320x568 and 844x390. Catalog retry and a deliberately unavailable WebGL context exercise the fallback UI; that test intentionally produces Three.js context-creation warnings.

Chrome software rendering is enabled for automated tests. These checks do not establish frame rate, memory use or real multitouch behavior on physical low-end phones. Physical-device and school-content review remain necessary before a classroom-wide rollout.

## Production Stress Gate

On September 6, 2026, the built application passed 20 atlas checks in 6.1 minutes: ten scenarios repeated twice with two parallel workers. This was a bounded local HTTPS stress run, not a claim about Vercel or Supabase's maximum capacity.

```sh
npm run build
npm run test:atlas:production
```

[The production configuration](../playwright.production.config.ts) uses `next start` through an ephemeral loopback HTTPS proxy, so the real Secure learner cookies and same-origin checks remain enabled. Both AI keys are cleared, uploads use a test-only key, and all writes use a disposable local SQLite database. No real learner records or external AI quota are used. The in-memory TLS certificate and its key are never stored in the repository. Ports 3110 and 3111 must be available.

[Stress scenarios](../tests/atlas-stress.spec.ts) cover corrupted geometry, three successive WebGL context-loss recoveries per run, navigation away during stalled downloads, three repeated viewer reopenings, all nine study topics and every system toggle, camera/isolation/explosion controls, 4x CPU slowdown and 120 ms network latency at 4 MB/s, mobile resizing, raw-binary fallback, and edits made while a note save is pending. Twelve isolated learners per run wrote twelve notes each, for 288 successful writes across both runs, with foreign reads/writes rejected and earned XP unchanged.

The stress run found and fixed a renderer teardown issue: four browser-owned textures remained allocated in each retired live WebGL context after ordinary Three.js disposal. Teardown now removes custom event listeners, disposes resources and explicitly loses a still-live context. The tests distinguish contexts already released by the browser from live allocations and verify that only the current scene retains a live context after recovery.

The existing real-geometry student workflow, source-selection handoff, responsive screenshots and no-WebGL fallback also run under the production configuration. Physical mobile-device performance, real multitouch hardware and cloud-wide capacity remain outside this local stress gate.