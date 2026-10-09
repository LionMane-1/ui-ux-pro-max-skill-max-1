# Atelier Blanc

A luxury garment care website and door-to-door collection booking app for a
fictional London dry cleaning house.

Six pages, a four-step booking flow with live estimates and draft persistence,
and a documented design system. Static HTML, CSS and vanilla JavaScript — no
build step, no framework, no runtime dependencies.

```bash
npm start          # serve at http://127.0.0.1:<port>
npm test           # functional + accessibility suites (needs `npm install`)
```

`npm install` is only needed for the tests; the site itself is plain files and
can be opened from any static host.

---

## The site

| Page | What it does |
| --- | --- |
| `index.html` | Hero, services, process, the craft argument, membership, testimonials, coverage checker, FAQ |
| `services.html` | Nine services in detail, each deep-linkable and each bookable directly |
| `pricing.html` | Four published price tables, three membership tiers, and the small print said plainly |
| `book.html` | **The booking app** — four steps, live estimate, draft recovery, confirmation |
| `about.html` | The house, the nine benches, the people, and an honest sustainability page |
| `contact.html` | Validated enquiry form, counters and hours, postcode coverage checker |

## The booking app

`book.html` + `assets/js/booking.js`. It is the reason this is an app and not a
brochure.

- **Four steps** — services, collection, your details, review — with per-step
  validation. You cannot advance past a step that is not valid, and the step
  you are on is announced to screen readers.
- **A live estimate** in a sticky panel that totals as you choose, applies the
  free-delivery threshold, and tells you how much more would earn it.
- **Draft persistence** to `localStorage`, restored on return with a visible
  banner and a one-click discard. Cleared on confirmation.
- **Deep links** — `book.html?service=bridal` arrives with that service
  selected, which is how every service page hands off.
- **Error summaries** at the top of each step listing every problem, each one a
  link that focuses the offending field; messages also sit inline beside the
  field, never only at the top.
- **Grouped choices validated as groups** — one message under nine service
  cards, not nine identical messages.
- **A confirmation** with a generated reference, the booked window, and the
  estimate.

Without JavaScript the same markup renders as one long, ordinary form that
still submits. The step rail and the Next buttons — the parts that would do
nothing — hide themselves.

## Design system

Tokens live in `assets/css/tokens.css` in three layers: primitives → semantic →
component. No raw hex value appears anywhere else.

**Palette.** Warm ink (`#14161a`) against bone (`#faf7f2`), with a single gilt
accent used the way real gold leaf is used — sparingly, on rules, small caps
and one button per screen. Verdigris appears only for eco and success signals.
Every text colour is pinned to a contrast floor: `--c-gilt-600` and
`--c-stone-400` were both darkened until they cleared 4.5:1 on the lightest
surface they land on.

**Type.** Cormorant Garamond for display, Inter for everything that has to be
read at 15px. Fluid `clamp()` scales, `text-wrap: balance` on headings and
`pretty` on body copy. Loaded from Google Fonts with real fallback stacks.

**Space.** A spacious marketing scale — sections breathe at
`clamp(4.5rem, 3rem + 7vw, 9.5rem)`. Radii stay small (2–10px); luxury reads as
light, so shadows stay barely there.

**Motion.** One easing curve (`cubic-bezier(0.22, 1, 0.36, 1)`), durations from
90ms to 900ms chosen per job. Scroll reveals stagger but cap at six so late
items never feel stalled. Everything collapses under
`prefers-reduced-motion: reduce`, including the marquee.

**Illustration.** Every image on the site is hand-authored inline SVG — the
hero garment, the care label, the maps, the preservation box, the shopfront.
Icons are a 37-symbol sprite injected once per page by `assets/js/icons.js`.
No emoji is used as an icon, and no asset is fetched from a CDN.

## Accessibility

Verified by `tests/a11y.mjs` on every page, not asserted:

- Skip link first in the tab order and visible on focus
- One `h1`, one `main`, no skipped heading levels, every `nav` named
- Every control labelled; every button and link has an accessible name
- All text meets WCAG AA contrast — the sweep composites translucent layers, so
  `rgba()` surfaces are measured as they actually render
- Focus rings redesigned, never removed
- Errors announced, linked, and placed beside their field
- Drawer traps focus, closes on Escape, and restores focus to its trigger
- Interactive targets are at least 44×44px
- No horizontal scroll at 390px on any page

## Structure

```
index.html services.html pricing.html book.html about.html contact.html
assets/
  css/tokens.css     design tokens — the only place hex values live
  css/main.css       base, layout, components, wizard
  js/icons.js        the SVG sprite
  js/site.js         header, drawer, reveals, accordion, postcode, validation
  js/booking.js      the booking wizard
tests/
  helpers.mjs        static server + browser harness
  functional.mjs     rendering, wizard, navigation, no-JS, reduced motion
  a11y.mjs           landmarks, names, keyboard, WCAG AA contrast
```

`assets/js/site.js` exposes two small helpers the booking app reuses:
`window.ABCoverage` (postcode matching) and `window.ABForm` (field validation,
error summaries, live re-validation).

### Notes on the tests

They drive real Chromium via Playwright. If the bundled browser is not
downloaded, point at an existing one:

```bash
CHROMIUM_PATH=/path/to/chrome npm test
SHOTS=./screenshots npm run test:functional   # also write screenshots
```

## Content

Atelier Blanc is invented. The address, phone number, prices, staff, reviews
and statistics are all fictional, written to give the design something real to
hold. Replace them before this goes anywhere near a real business.
