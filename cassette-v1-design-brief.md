# Cassette V1: design brief

A handoff document for Claude Design. This is the brief for the V1 visual overhaul, design system, logo, landing page, and brand identity. It supersedes all earlier visual direction including the aurora flourish system, which was a useful intermediate exploration but does not belong in V1.

---

## The brief in one sentence

Cassette is a personal cinema machine that lives on your desk. Design it like a piece of warm analogue hardware that happens to be made of pixels.

---

## The shift

Cassette was originally specced in the Linear / Arc / Things 3 territory: cool, monochrome, surgical, optimised for clarity. That work produced a functional V0 but the aesthetic doesn't match what the product actually is. The user's relationship with Cassette is intimate (their personal collection, their viewing rituals, films they love), and a cool clinical interface fights against that intimacy.

V1 moves the visual language toward warm analogue hardware: black lacquered surfaces, recessed forms, warm ember light glowing from beneath as if from a heating element or hot resin. The reference point is a Marshall amplifier, a Studer tape machine, a high-end hi-fi separate. Premium objects that feel weighted and mechanical and warm to the touch.

The aurora flourish system from the V0 work used a full RGB spectrum on interaction. V1 keeps the principle (interactions are acknowledged through brief visual flourish, then return to baseline) but transmutes the execution into ember-warm. A button press warms a recess. A state change pulses orange like a heating element. There is no spectrum, no rainbow, no cool blue. Everything alive is warm.

---

## Brand philosophy

Cassette is for people who want a more intentional relationship with their personal media collection. It is not a streaming service replacement. It is not a media library tool. It is a place where someone's films live, where their viewing history accumulates, where archiving feels meaningful.

Six principles drive every visual and interaction decision:

1. **Intentional media ritual.** Cassette is opened to watch something, not to browse endlessly. The interface should reward intent and discourage drift.
2. **Tactile interaction.** Every interaction should feel mechanical and weighted, like pressing a physical button or inserting a tape. No floaty digital ease curves.
3. **Warm embedded surfaces.** Surfaces are recessed, embedded, made of material. Light comes from within and beneath, not from above.
4. **Calm, stable architecture.** The window does not buckle around the media. Cassette is a stable cinematic environment that media settles into.
5. **Local-first cinematic experience.** The user's collection is the centre. The internet is a service Cassette uses, not the source of identity.
6. **Premium but restrained.** Quiet confidence, not flash. Nothing earns its place by being loud.

---

## Design pillars

Five pillars that any visual or interaction decision must serve. If a proposed treatment fails any of these, it doesn't ship.

1. **Material before flat.** Surfaces have implied physical properties: lacquer, brushed metal, warm resin, heated glass. We do not draw flat coloured rectangles.
2. **Warmth before coolness.** When colour appears, it is warm: ember orange, copper, deep oxblood, cream. Cool colours are reserved for technical states (information, links) and used sparingly.
3. **Weight before lightness.** Motion has mass. Things settle into place rather than glide. Easing curves overshoot and settle, like a switch falling.
4. **Restraint before expression.** A surface earns its decoration by needing it. The default is quiet.
5. **Permanence before novelty.** Cassette should feel like an object that has always existed and will continue to. No trendy details that will date the product.

---

## Visual language

### Material and light

V1's defining move is treating UI surfaces as having implied physicality. This is achieved through restraint, not skeuomorphism. We are not drawing leather stitching or felt. We are using inner shadow, subtle gradient (single colour family only, never spectrum), and tonal layering to suggest depth without illustrating it.

Three surface treatments make up the system:

- **Lacquer.** Near-black surfaces with very faint warm undertone. The dominant surface in the app. Slight inner darkness at edges suggests a polished, slightly curved finish. Use for the outermost app frame, the player chrome, the library background.
- **Recess.** A surface that has been pushed in slightly, with a subtle dark inner edge at the top and lighter at the bottom (light comes from below in this system). Use for buttons at rest, input fields, the play button housing.
- **Ember.** A warm orange glow emanating from beneath a recess, as if light is leaking through from a hot element below. The visual signature of the entire product. Use for the primary play button (always lit), interactive states (recess warms when activated), and the logo itself.

Light direction is from below. This is unusual for digital UI (which typically lights from above) and is the single visual decision that makes Cassette feel like a different kind of object. Every shadow, every highlight, every glow assumes the light source is below the surface.

### Colour palette

Three working palettes. All values are starting points for Claude Design to refine.

**Lacquer** (the dominant surface family):

```
--lacquer-deep: #0A0908     (the deepest black, full negative space)
--lacquer-surface: #141210  (the standard surface)
--lacquer-raised: #1C1A17   (slightly lighter, for elevated elements)
--lacquer-edge: #221F1B     (border highlights, edge wear)
```

**Ember** (warm interactive glow):

```
--ember-core: #FF6B1F       (the hottest point of the glow)
--ember-mid: #C9501A        (the body of the warmth)
--ember-deep: #6B2A0F       (the cooled outer edge of the glow)
--ember-resin: #8C3A3A      (the existing burgundy, for secondary warm states)
```

**Light** (text and reflective surfaces):

```
--light-primary: #F2EBE0    (warm cream, primary text)
--light-secondary: #B8B0A4  (muted cream, secondary text)
--light-tertiary: #6E6962   (deep muted, tertiary text)
--light-mono: #E8E2D6       (slightly cooler cream, for mono technical readouts so they read as informational)
```

**Functional accents** (used very sparingly, for states that genuinely require differentiation):

```
--accent-info: #6B8FB5      (cool grey-blue, for links and informational states only)
--accent-positive: #7A9B6E   (muted sage, for success states)
--accent-warning: #C9A55A    (muted brass, for warnings)
```

Things that should not appear: pure black (#000), pure white (#FFF), saturated primary colours, gradients with more than two stops in the same colour family, any colour outside this palette. The aurora spectrum is gone.

### Typography

Role-based, four faces total. Each has a job and only does that job.

**Primary UI sans.** Inter or similar. Used for navigation, button labels, body copy, modal text, anything functional. Default weight 400, 500 for emphasis. Never 600 or above.

**Archival mono.** A mono with slight personality, not a code font. Reference points: GT America Mono, Söhne Mono, IBM Plex Mono. Used exclusively for technical readouts: timecodes, file paths, runtime, file sizes, episode numbers, codec info. The visual signature that says "this is data about the media."

**Cinematic serif.** Used very sparingly, only for editorial moments: the title of a film at the top of its detail page, perhaps the Cassette wordmark, possibly empty state copy. Never for body. Reference points: Söhne Breit, Lyon Display, Caslon, GT Sectra. Playfair Display from the prior pass is too theatrical; pull it back toward something with industrial restraint.

**Optional handwritten accent.** A handwritten or mark-style face used only for personal touches: a user's note on a film, a personal rating, a "watched on" date. Reference points: Caveat, Reenie Beanie, but ideally something custom-feeling rather than Google Fonts. This is the warmth font, the "human handled this" font. Use almost never. When it appears, it should feel like a private mark in a leather-bound ledger.

### Motion

All motion in Cassette is mechanical. The signature easing curve is a slight overshoot followed by a quick settle, like a physical switch falling into place. Suggested base curve: `cubic-bezier(0.34, 1.4, 0.5, 1)` for activations. For dismissals and fade-outs, a heavier ease-out: `cubic-bezier(0.7, 0, 0.84, 0)`.

Standard durations:

- 120ms for small surface changes (hover state warming)
- 200ms for state transitions (button press, toggle)
- 320ms for view transitions (entering a film detail page)
- 600ms for the ember warm-up cycle when a primary action fires
- 1200ms for the ember cool-down when something settles

Animation is for confirmation, not decoration. Things do not move because movement is interesting. Things move because something happened.

### Iconography

Icons are minimal, drawn with consistent stroke width (1.5px at standard sizes), rounded line caps, and no decorative flourishes. Reference points: the Lucide icon set as a baseline, with custom icons drawn for Cassette-specific concepts (the recessed play button, the ember indicator, the cassette tape glyph for the brand).

The brand glyph is a stylised cassette tape: a horizontal rectangle with two reels visible, drawn with a single weight of line. This appears in the wordmark, the favicon, and as a watermark in empty states.

---

## Logo

The Cassette logo is the central brand asset. The direction is specific.

### Concept

A black lacquered surface, slightly textured, with a play triangle recessed into it as if carved out of the material. From within the recess, a warm orange ember glow emanates upward, making the play symbol legible through light rather than through ink. The effect is glowing hot resin trapped beneath a polished black surface, or a heating element behind smoked glass.

The surface itself has subtle imperfection: very fine scratches, a slight unevenness in the lacquer, the kind of texture you'd find on a well-loved Marshall amp head. This is not skeuomorphism. The texture is barely perceptible, just enough to communicate that this is a *thing*, not a flat icon.

### Variants required

- **Primary mark.** Square format, full ember glow, used for the app icon, hero on the landing page, social profiles.
- **Wordmark.** "Cassette" in the cinematic serif, with the primary mark at the start. Used in headers, documentation, donation pages.
- **Monochrome.** Same composition, no ember glow, just the lacquered surface with the recessed triangle. For places where colour is inappropriate (system tray, B&W documentation).
- **Brand glyph alone.** The cassette tape silhouette mentioned above, used as a small accent in the UI and as a favicon at very small sizes where the embered logo wouldn't render legibly.

### What the logo must achieve

The first time someone sees the logo, three things should land:

1. This is a piece of analogue hardware translated to a screen.
2. It is warm and inviting, not clinical.
3. It rewards attention. The longer you look at it, the more depth you see.

The first reaction we want is "what *is* that?" The second reaction is "I want to use it."

---

## Interaction language

Cassette's interactions are mechanical. This is more than animation, it's the entire feel of using the app.

### The tactile principles

- **Buttons recess on press.** A button is at rest, hovered (it warms slightly), pressed (it pushes into the surface), released (it springs back with a small overshoot). The path is recessed → ember warm → cool ember settling.
- **Activation has a "clunk."** When something committed happens (a profile is applied, a film is favourited, a download starts), there is a brief mechanical settle. Visually this is the slight overshoot in the easing curve. If we ever add audio, this is where a soft click would go.
- **State persists through visual weight.** An activated state isn't just a colour change, it's a different surface treatment. An active filter chip is visually heavier than an inactive one, as if the active one has settled into the surface and the inactive one is sitting on top.
- **Hover is warmth, not lift.** When the cursor is over an interactive element, the element warms (inner glow intensifies slightly) rather than lifting up. Light comes from underneath; warming is the natural metaphor.
- **The play button is alive.** Always faintly glowing, the ember intensity tied to the playback state. Brighter when playing, dimmer when paused, brightest in the moment of transition.

### Specific interaction patterns

- **Scrubbing.** The scrubber is recessed into the surface. The played portion glows ember from beneath the recess. The handle is a small lacquered marker that catches light. Mouse wheel scrub moves the handle with mechanical weight (slight overshoot then settle on each detent).
- **Volume.** Treated as a recessed slot with a glowing fill, same family as the scrubber. No floating tooltip; the value is part of the slot.
- **Fullscreen entry.** The chrome doesn't fade. It recedes into the surface as if pulled inward, with the ember dimming as it goes. Exit reverses: chrome rises back out of the surface, ember warming up.
- **Film selection.** Hovering a poster causes the surrounding lacquered surface to warm subtly. Clicking causes the entire poster to recess into the surface, then the film detail rises up to fill the frame.
- **Continue watching.** The progress bar on each thumbnail is a thin line of glowing ember. The thumbnail itself is recessed into a small frame, like a slide in a viewer.
- **Notifications and confirmations.** Never modal. A small ember pulse on the relevant element is enough.

### Things to avoid

- Floating cards with drop shadows from above
- Glassmorphism, frosted glass, blur effects (these are wrong for the material we're describing)
- Bouncy or playful easing curves
- Any interaction that doesn't have a mechanical metaphor

---

## Component vocabulary

The following components need design treatment in V1. Each is described in functional terms; Claude Design produces the visual treatment.

### Foundation

- App frame (the outermost lacquered surface)
- Window controls (custom, integrated into the lacquer)
- Title bar / page header
- Navigation between Library and Player views

### Library

- Filter chips (All, Films, TV, Collections, Sources)
- Search input (recessed, with the magnifier glyph in ember)
- Continue Watching strip with frame previews
- Browse grid (poster cards with runtime, year, ember-edged hover)
- Series detail view (header with serif title, episode list with frame thumbnails)
- Film detail view (header with poster, metadata, play button, optional notes)
- Collections / Favourites view (the "watched and loved" archive)
- Sources panel (folder paths, scan status, refresh action)
- Empty states (using the cassette glyph as quiet watermark)

### Player

- Title bar (filename in mono, recessed)
- Video frame (the still, calm centre)
- Profile chip (top right, ember dot indicates active profile)
- Audio chip (bottom right)
- Skip overlay (5s back, play, 5s forward, all warm-recessed)
- Scrubber with frame preview tooltip (recessed slot, ember fill)
- Transport row (episode context, prev/play/next, timecode in mono)
- Audio track popover (per-series propagation toggle)

### Archiving

- DVD ripping flow (insert disc, detect, name, rip ISO, progress, complete)
- Source selection (which folder to save to)
- Progress display (percentage, time remaining, in mono)
- Disc detail (title, runtime, audio tracks, subtitle tracks, year)

### Settings

- General (window behaviour, language, default profile)
- Playback (the three shader profiles, advanced options gated behind "Show advanced")
- Network (Trakt sync, Letterboxd export)
- About (version, attribution, donation link)

### Onboarding (first run)

- Welcome screen with the logo and the philosophy in one line
- Add your first source (folder picker)
- Optional: connect Trakt
- Optional: connect Letterboxd
- "You're set" with the cassette tape glyph

### Landing page (separate but designed in same system)

- Hero with logo and one-line pitch
- The "calm cinematic machine" demonstration (looping silent video of the app in use)
- Feature breakdown
- Public roadmap
- Download button
- Support section (Ko-fi, Patreon, GitHub Sponsors)
- About / philosophy

---

## Screens for V1

A complete inventory of screens that must be designed for V1 release. Claude Design should produce a high-fidelity mockup of each.

1. First-run welcome
2. First-run source picker
3. First-run Trakt connect (optional, skippable)
4. Library: empty state
5. Library: populated, default view
6. Library: filtered to Films
7. Library: filtered to TV
8. Library: Collections / Favourites view
9. Library: Sources panel
10. Library: search results
11. Series detail view
12. Film detail view
13. Player: idle (no overlay visible)
14. Player: paused with skip overlay visible
15. Player: scrubbing with frame preview
16. Player: audio track popover open
17. Archiving: insert disc prompt
18. Archiving: disc detected, ready to rip
19. Archiving: ripping in progress
20. Archiving: complete, file in library
21. Settings: general
22. Settings: playback profiles
23. Settings: network (Trakt, Letterboxd)
24. Settings: about (with donation link)
25. Landing page: hero
26. Landing page: features
27. Landing page: roadmap
28. Landing page: support / donate

---

## Landing page direction

The landing page lives at dilater.studio/cassette (or cassette.dilater.studio, structure to be decided). It is the first impression for everyone who hears about Cassette.

### Structure

1. **Hero.** Full viewport. The Cassette logo at large size, animated subtly (the ember glow breathing slowly, very slow pulse, maybe one breath every 5 seconds). Beneath: one line of philosophy. Beneath that: a single download button and a "view on GitHub" link. No nav, no menu, nothing else.
2. **The pitch.** Two paragraphs. What Cassette is, who it's for, why it exists. Written in the same voice as the rest of the brand: confident, restrained, warm.
3. **Demonstration.** A silent looping video of the app being used. Hovering a poster, pressing play, scrubbing through a film, switching to fullscreen. No UI explanation, just showing the calm rhythm of the product.
4. **Features.** Six to eight feature blocks, each a small card showing a screenshot or detail and a one-line description. Library, playback, continue watching, archiving, Trakt sync, collections.
5. **Roadmap.** Public roadmap so supporters know what they're funding. Three columns: in V1 (shipped), coming next (V1.x), eventually (V2+). Honest about timing.
6. **Philosophy.** A longer-form piece for people who want to understand why this exists. Touches on the personal media argument, the open source approach, the integrity of refusing to monetise the user.
7. **Support.** Three options: Ko-fi (one-off), Patreon (recurring), GitHub Sponsors (developer-friendly). Each with a brief description and a button. No tier marketing, no benefits table. The pitch is "support this work because you believe in it."
8. **Footer.** Minimal. Logo small, copyright, license, the dilater.studio mark.

### Design notes

The landing page uses the same design system as the app. The lacquered black surface, the warm cream text, the ember accents. It should feel continuous with using Cassette itself, like the website is the storefront for the same hardware that ships when you download.

The ember motif is critical here. The hero glow, the small ember dots beside section headings, the warm tone of every interactive element. Nothing cool, nothing clinical.

Typography on the landing page can be slightly more expressive than in the app. The cinematic serif gets a bit more space here, used in headlines. The handwritten accent might appear once or twice as a personal note ("a project by Dom").

---

## Donation flow

Donations are first-class. The product is free, the user owns their data, and the only path to sustainability is voluntary support. The flow must feel honest, not aggressive.

### In the app

- A "Support Cassette" link in the Settings → About page. Lists Ko-fi, Patreon, GitHub Sponsors with brief descriptions.
- A small "supporters" credit somewhere subtle in the app (perhaps a long-press on the logo reveals a slow scroll of supporter names, like film credits). Optional, only for people who opt in.
- Never a popup, banner, or interruption asking for money. The product asks nothing of the user beyond what they came for.

### On the landing page

- The Support section described above, sitting after the philosophy section. By the time someone scrolls there, they've seen the product, understood it, and been told why it exists. Then the ask happens.
- Specific, achievable supporter tiers if Patreon is used: not "unlock features" tiers (Cassette has no premium features), but "level of support" tiers ($3 = name on credits, $10 = early access to roadmap items, $25 = name on credits in the app and website). Soft benefits, no functional gatekeeping.
- Clear, honest copy about what donations fund: development time, code signing certificate, server costs, occasional commissioned work.

### What never happens

- No paywalls.
- No premium features.
- No tracking.
- No "this would be unlocked if you donated" messaging.
- No tier that gives functional capabilities the free version lacks.

Cassette's position is that the product is the gift. The donation is for the work, not the feature.

---

## What is not in V1

To prevent scope creep and to give Claude Design clarity on what to focus on, the following are explicitly out of scope for V1. They are on the public roadmap and will be designed in their own time.

- FLAC and audio playback mode
- Album browsing and gallery view
- Ambient audio visualisers
- Adaptive contrast playback controls (light UI on dark scenes, etc.)
- Phone or web remote
- Casting and Chromecast support
- Projector support
- Cassette OS or hardware ecosystem
- Tape (torrent companion app)
- Any DVD decryption or CSS handling (V1 ships ISO ripping only; playback handles decryption transparently via mpv)

If Claude Design wants to gesture at these in the public roadmap section of the landing page, that's encouraged. Otherwise, they should not be designed.

---

## References and inspiration

Visual references in roughly the right territory:

- **Marshall amplifiers** (the head units, especially): black tolex, brass details, recessed buttons with warm internal glow.
- **Studer A800 / A810 tape machines**: industrial, brushed surfaces, mechanical feel, warm lit indicators.
- **Hi-fi separates from Naim, Linn, Rega**: minimal, premium, no flash.
- **Teenage Engineering OP-1 and TX-6**: modern interpretations of analogue hardware aesthetics, but without the playful colour. Cassette is more restrained than TE's product line.
- **The Criterion Collection's print and packaging design**: typography, restraint, editorial confidence, the way they treat film as an object worth caring for.
- **Issue magazine layouts and editorial design**: the way cinematic serifs work alongside grid-based functional sans.
- **Late-stage analogue hi-fi advertising from the 70s and 80s**: warmth, materiality, weight. Pioneer ads, Marantz ads, McIntosh ads.

Visual references in the wrong territory (do not draw from these):

- Streaming service UIs (Netflix, Plex, Jellyfin)
- Apple's current frosted glass / glassmorphism direction
- Linear, Arc, Things 3 (the V0 reference, now superseded)
- Any RGB / cyberpunk / gaming aesthetic
- Dribbble-style illustration

---

## Deliverables expected from Claude Design

1. **Logo system.** Primary mark, wordmark, monochrome version, brand glyph, in vector form. App icon at all required sizes.
2. **Design tokens.** Final colour palette, typography scale, spacing scale, motion curves, all expressed as CSS custom properties.
3. **Component library.** All components listed in the Component Vocabulary section, designed in both rest and active states. Delivered as a Figma file and as a set of CSS / React component templates.
4. **Screen mockups.** All 28 screens listed in the Screens for V1 section, in high fidelity. Showing the full design system applied.
5. **Landing page mockup.** All sections, mobile and desktop versions.
6. **Motion specifications.** A short document or video showing the key motion patterns (ember warm-up, button press, view transitions).
7. **Engineering handoff document.** A spec for Claude Code (Cassette's implementation chat) describing how to translate the design system into the existing codebase.

---

## Hand-off notes for engineering

Once Claude Design produces the system, the implementation in the existing Cassette codebase will involve:

- Replacing the entire colour palette in `globals.css` with the new tokens.
- Replacing the aurora flourish system in `aurora.css` with the new ember interaction system.
- Updating every component to use the new surface treatments (lacquer, recess, ember).
- Designing or commissioning the four typefaces and bundling them with the app.
- Reworking the logo asset and replacing it everywhere it appears.
- Building the landing page as a separate static site, deployed alongside the app on dilater.studio.
- Wiring up the donation links.

This is a substantial visual rebuild but the underlying architecture (Tauri, React, libmpv, the library system) does not change. Engineering's job is to redress the existing skeleton in new clothes, not rebuild it.

---

## A closing note on tone

Cassette is for someone who cares. Someone who collects films, who remembers where they were when they first saw a particular scene, who keeps the case of a Criterion edition because the design matters. The brand voice should match this. Confident but not loud. Warm but not chatty. Specific but not pedantic. The voice of someone who has thought about this carefully and has chosen their words.

When in doubt, write less and trust the work.
