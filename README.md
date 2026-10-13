# Rightmove Plus

A Chrome extension that makes Rightmove search results and property pages easier to browse.

- **Grid view** for search results (sale and rent), using the full window width. A List/Grid toggle sits under the results count, and your choice is remembered. Each card has a **Land** row and an **Agent** row. Land shows the acres given in the listing's key features, summary and full description, highlighted ("4 acres", "0.5 acres" for "half an acre"; hover for the sentence it came from), or "No acres mentioned". The full description is fetched as cards scroll into view, so a card can show "Checking details…" for a moment.
- **Quick-look modal** instead of opening a new page. Every property has **Details**, **Gallery** and **Map** buttons, in grid and list view alike. Clicking the photo or title opens Details. Inside the modal you can switch between the three tabs.
  - **Details**: the real property page, without the site header and footer.
  - **Gallery**: full-size photos with thumbnails, plus floorplans. Use ← → to browse. A strip above the photos shows the same Agent and Land, plus **Open plan** and **Modern**: "Mentioned" (highlighted; hover for the sentences) if the listing's key features, summary or description say open plan / open-plan / openplan or modern (not "modernised"), otherwise "Not mentioned".
  - **Map**: Google Map of the property with a Satellite toggle and links to Street View and Google Maps.
  - **Open page** opens the normal property page in a new tab. `Esc` closes the modal.
  - Cmd/Ctrl-click or middle-click a property to open it in a new tab as usual.
- **Property pages** get a **Gallery / Floorplans / Map** bar under the photos, opening the same modal (without the Details tab, since you're already on the page). Rightmove's own photo, floorplan and map links open it too, at the photo or plan you clicked, instead of Rightmove's full-screen viewers. Videos, virtual tours and Street View still use Rightmove's viewer.
- **No adverts**: ad networks are blocked on rightmove.co.uk (`rules/ads.json`). Leftover ad slots, the in-feed and sidebar ads, agent brand banners and the paid "Featured property" slot are hidden (`src/site.css`).

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

After editing any file, click the reload icon on the extension's card and refresh Rightmove.

## How it works

| File | Role |
| --- | --- |
| `src/search.js` | Search pages: grid, toolbar and card buttons. Reads results from the page's `__NEXT_DATA__`, then from `/api/property-search/listing/search` when you change page or filters. |
| `src/property.js` | Property pages: the Gallery / Floorplans / Map bar, and routes Rightmove's `#/media`, `#/floorplan` and `#/map` links to the modal. |
| `src/ui.js` | The modal (Details, Gallery, Map) and DOM helpers, shared by both pages. |
| `src/acres.js` | Finds amounts in acres in a listing's text, for the cards and the gallery. Rightmove's own size in acres is the floor area converted, so it isn't used. Also finds mentions of open plan and modern, for the gallery. |
| `src/model.js` | Decodes a property page's embedded `__PAGE_MODEL` (photos, floorplans, location): read from the current page on a property page, fetched otherwise. |
| `src/frame.js` | Marks a property page shown inside the modal so the header and footer are hidden. |
| `src/site.css` | Hides ad slots on every Rightmove page and frame. |
| `src/ui.css` | Styles for the modal and the shared buttons. |
| `src/search.css` | Styles for the grid. |
| `src/property.css` | Styles for the property page bar. |
| `rules/ads.json` | Network rules that block ad requests initiated by rightmove.co.uk. |

Rightmove's class names include build hashes, so the extension matches them by prefix (e.g. `[class*="ResultsList_resultsColumn"]`). If Rightmove changes its markup and something stops working, the grid falls back to the normal list. Property page class names are fully hashed, so `property.js` relies on `data-testid="photo-collage"` and the `#/…` link targets instead.
