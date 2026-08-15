**Comparison Setup**

- Primary source visual truth: Figma `DDA_design`, node `214:3170`
  (`https://www.figma.com/design/cpbYL8IAeKDbSvAHHNszKq/DDA_design?node-id=214-3170`)
- Attached raster reference: `.context/attachments/4B80oh/Time Map_1.jpg`
- Focused source crop: `.context/qa/infographic-map-crop.jpg`
- Implementation screenshot supplied by the user: `.context/attachments/iGFz7z/Capture-2026-08-15-183211.png`
- Intended desktop viewport: 1440 × 900 CSS px, device scale factor 1
- Source dimensions: 4677 × 6623 px; focused crop 2600 × 3600 px
- Implementation pixel dimensions: 2048 × 1266 px; CSS viewport and density normalization are unknown
- State: default `시간 · 트램 후`, origin `관저네거리`

**Findings**

- [P2] A same-viewport post-fix visual comparison is unavailable.
  Location: full application.
  Evidence: the in-app browser is unavailable, while connected Chrome repeatedly times out even on a tab-list request. The extension, browser, and native-host checks pass, but no post-fix browser capture can be produced in this session.
  Impact: title/map overlap, the 70% first-screen balance, hover placement, and responsive spacing cannot be signed off visually.
  Fix: restore a working browser connection, capture 2048 × 1266 and 1440 × 900, combine each implementation image with the source, and rerun the comparison.

**Required Fidelity Surfaces**

- Fonts and typography: Pear Toucan Bold (`페어 큰부리새 Bold`) is used for the complete three-line main headline, with the source's 1.28:1 first-line size ratio and 1.2 / 1.4 / 1.23 line-height structure. KIMM Bold is reserved for KPI emphasis. Post-fix wrapping remains unverified.
- Spacing and layout rhythm: at 2048 × 1266, the calculated map stage is 1534 × 1468 and the visible map bounding area intersects approximately 70.7% of the viewport. The title and right metrics sit above the map as poster layers. Wheel input settles for 240ms, then transitions over 440–720ms. Geometry zooms while strokes and dashes remain screen-pixel constant; station markers respond within a clamped 0.78×–1.85× screen range.
- Colors and visual tokens: refetched from Figma node `214:3170` — paper `#FAFAFA`, lower tint `rgba(199,255,0,.8)`, city hue `#CEF00A` (calmed to 62% opacity per feedback), tram overlay `rgba(255,131,36,.4)`, map ink/route/rings `#076940`, and district cutline `#ECECEC`. Unnecessary city and time-map outline strokes remain omitted per user feedback.
- Image quality and asset fidelity: the source location-pin asset (`Group 75`) was downloaded and committed as `assets/figma/origin-pin.svg`; it replaces the hand-drawn origin leader line. No generated or placeholder visual assets were introduced.
- Copy and content: district names and static map labels remain removed. Hover uses a single DOM tooltip; the duplicate canvas label and leader line were removed.

**Full-view Comparison Evidence**

- The user-supplied pre-fix screenshot was inspected against the attached poster reference.
- Blocked: no matching post-fix implementation screenshot.

**Focused Region Comparison Evidence**

- Source map region inspected at `.context/qa/infographic-map-crop.jpg`.
- Blocked: no matching implementation region capture.

**Comparison History**

- Pass 1: source opened and focused map crop created; browser capture unavailable.
- Pass 2: user-supplied screenshot exposed oversized zoom styling and a two-line headline mismatch. Screen-space inverse compensation, clamped marker scaling, debounced animated zoom, a three-line headline, and thinner text halos were implemented. Post-fix capture remains unavailable.
- Pass 3: district outlines were replaced by one-sided shared-boundary runs to prevent doubled seams; headline leading was opened to 1.08; time rings were reduced to 0.9px at 34% layer opacity; the desktop right rail now fades through a 100px bottom mask instead of ending as a hard rectangle. Post-fix capture remains unavailable.
- Pass 4: headline leading was opened further to 1.18 (1.14 mobile), and all canvas information-text outlines were removed in favor of direct single-color fills. Post-fix capture remains unavailable.
- Pass 5: Figma `214:3170` was refetched. The first-screen map stage was expanded to a calculated 70.7% viewport bounding area; the title was rebuilt with source line ratios; paper/tint/map tokens were corrected; the exact Figma origin pin replaced the leader line; hover canvas labels were removed; tram/metro routes increased to 4.6px/2px screen weight; and wheel zoom was retuned to a 240ms settle plus smooth animation. Post-fix capture remains unavailable because both available browser routes are blocked.
- Pass 6: the route renderer was replaced with a centripetal, tangent-capped cubic curve to prevent overshoot and accidental loops. District boundaries now discard sub-1.1km fragments and apply 180m RDP simplification before rounded interpolation. The four map-mode controls were changed to a fixed four-column grid so they remain on one line at every breakpoint. Syntax and whitespace checks pass; post-fix browser evidence remains blocked.
- Pass 7: the five districts were rebuilt as independent SVG fill paths over a shared city underlay, while their seams were extracted into one SVG boundary path to eliminate doubled or broken edges. Routes, stations, rings, and the Figma origin pin now share the same SVG coordinate system with non-scaling strokes. A static 2048 × 1266 SVG render confirmed 5 district regions, 1 shared boundary layer, 4 route paths, and 67 station markers; JavaScript syntax and whitespace checks pass.

**Implementation Checklist**

- Capture the default desktop state at 2048 × 1266 and 1440 × 900.
- Compare 70% map balance, title/map overlap, pin scale, district cutline thickness, and headline wrapping against the source.
- Inspect tight tram turns and district junctions at 1×, 2×, and 4× zoom for overshoot, doubled seams, or fragmented strokes.
- Confirm the four mode controls remain a single row at desktop, tablet, and mobile widths.
- Check hover, origin change, all four view modes, and mobile bottom sheet.
- Check the browser console for errors.

**Follow-up Polish**

- Tune ribbon width or label offsets only after a same-viewport visual capture is available.

final result: blocked
