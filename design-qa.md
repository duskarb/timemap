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
- Colors and visual tokens: refetched from Figma node `214:3170` — paper `#FAFAFA`, lower tint `rgba(199,255,0,.8)`, city hue `#CEF00A` (calmed to 62% opacity per feedback), tram overlay `rgba(255,131,36,.4)`, and map ink/route/rings `#076940`. The district cutline is the map ink at 45% — `rgba(7,105,64,.45)`. Two earlier values were wrong for different reasons: `#ECECEC` is the paper shadow behind the city silhouette rather than the cutline, and read as near-white on the fills; the reference's own `#F4C39C` was sampled correctly but only works over the poster's mustard (lime and orange overlapping), and on this build's lighter tram-after orange it sits at nearly the same lightness and disappears. Ink at partial alpha holds on both fills and stays inside the locked palette. Unnecessary city and time-map outline strokes remain omitted per user feedback.
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
- Pass 8: the district cutline was reworked after the user rejected its quality. Four defects were confirmed against the raster reference and in the live DOM. (1) Colour: `#ECECEC` was the city's paper shadow, not the cutline; on the lime and tram fills it read as near-white. (2) Continuity: shared boundaries are extracted per district *pair*, so the line broke at every three-district junction — 7 open runs at 1440 × 900, one only 19 px long, each closed with a round cap, leaving stubs and dots on the fill. Runs whose endpoints meet are now chained along the straightest continuation, caps are `butt`, and pieces that stay short are dropped; the same view now draws 3 continuous chains with no dangling ends within 40 px of each other. (3) Curve: the midpoint-quadratic chain used every vertex as a control point and no vertex as an anchor, halving exactly the corners RDP had been kept to preserve. It now shares the routes' centripetal, tangent-capped curve, which interpolates its vertices; geographic simplification eased from 180 m to 70 m and a per-frame 1.1 px screen-space thinning pass was added, since the time warp compresses geographically even vertices into knots. (4) Weight: `stroke-width:4` with `non-scaling-stroke` held one screen width across every zoom and viewport. The width is now derived per layout from the geographic map width and responds to zoom through the clamped curve used for station markers — 2.6 px at 1440 × 900, 1.8 px on a 375 px viewport. The reference's own 0.78 % ratio was measured but not adopted: this map deliberately overflows the viewport where the poster's is contained, so that ratio yields 5.9 px and outweighs the 5.2 px tram trunk. Verified by screenshot in all four view modes at 1440 × 900 and at the 375 px breakpoint, and at 1.4× zoom; `node --check` passes.
- Pass 9: the user reported the districts were not cleanly divided and the line read as washy. Both were real. **Partition completeness** — five districts share exactly seven pair boundaries (유성↔서 18.3 km, 유성↔대덕 12.0 km, 서↔중 9.9 km, 서↔대덕 3.2 km, 중↔동 22.4 km, 중↔대덕 1.15 km, 동↔대덕 19.1 km), and every one is load-bearing. Pass 8's length filters had been tuned against the *geographic* map, but the time projection compresses 중구↔대덕구 from 1.15 km down to about 20 px, so it fell through both the 32 px per-frame cull and the screen-gap thinning: the geographic view drew four chains while the time views drew three, silently fusing 중구 and 대덕구. The per-frame length cull is gone, the pre-filter is now only wide enough to catch slivers the 220 m proximity match could invent (0.3 km against a 1.15 km real minimum), and the thinning pass always keeps both endpoints. All four view modes now draw four chains covering 86.0 km of the 86.1 km extracted. **Contrast** — see the colour note above; the cutline moved to ink at 45 %. Re-verified in all four modes at 1440 × 900 and at 375 px.

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
