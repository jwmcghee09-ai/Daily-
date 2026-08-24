# Photos

Drop real photographs here as the business produces them, then reference
them from the pages. Until then the site uses generated product renders
and a UI illustration, which are honest stand-ins — no stock photos of
server rooms we do not own.

## Where photos will have the most impact, in order

1. `hero.jpg` — a real Core/Forge/Atlas unit, lit against a dark ground.
   Replaces nothing; sits beside the routing diagram on the home page.
2. `install.jpg` — an actual on-site install: the machine going into a
   real office, cables being run. This is the single most persuasive
   photo you can take, because competitors cannot fake it.
3. `interface.png` — a genuine screenshot of Nodal OS once the UI is
   built. Swap it in for the illustration on the software page and
   delete the "Interface illustration" caption.
4. `team.jpg` — you, on site. Small businesses buy from people.

## Shooting notes to keep the site coherent

- Dark backgrounds. The palette is near-black (#030303) with warm brown
  panels; photos on white will fight it.
- A single purple or crimson light source in frame ties a photo to the
  brand without editing.
- Landscape, at least 1600px wide. Save JPEG at ~80% quality.

## Adding one to a page

    <img src="images/install.jpg" alt="A Forge server being installed at
         a client site" class="photo" loading="lazy">

The `.photo` class is defined on every page: full width of its column,
1px brown border, no rounding.
