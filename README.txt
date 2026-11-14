THE DEVOTED MC | EAGLE RIDER | PRODUCTION RELEASE 1.0
=====================================================

DEPLOYMENT TO GITHUB PAGES
1. Extract the ZIP. All files inside are at the ZIP root.
2. Upload the extracted contents to your existing GitHub Pages publishing folder
   (typically the repository root, or /docs if your site uses that source).
3. Keep index.html, game.html, game.js, styles.css, contact-us.html,
   fafo.html and the complete assets/ directory together.
4. Do not upload the parent folder instead of its contents.
5. Visit the live site, hard refresh, and test Sound, Start, Pause and Jump.

LOCAL PLAY
Open index.html or game.html in a modern browser. The production site's
assets are local; internet is not required for the game itself. Facebook and
Messenger links naturally require a connection.

CONTROLS
Space / Up Arrow / W to start or jump. Touch: tap the playfield.
P to pause or resume. Sound can be switched off at any time.

GAME BEHAVIOR
Starts at 2x with the original jump physics. Speed increases continuously.
Hazard-specific crash animations, special roadside deer/car warnings,
near-miss bonuses, and occasional ramps are retained. Best score is kept
in this browser's local storage only, not a shared leaderboard.

TECHNICAL NOTES
- No server-side code, external JavaScript packages or trackers.
- All road obstacle sprites are high-quality WebP; original official club logos remain PNG.
- Game audio is bundled MP3; the short spoken lines are synthesized.
- Sound starts after player interaction as required by browser policies.
- Native Abaddon font files are not bundled; browsers use an available
  fallback if Abaddon is not installed. To guarantee Abaddon on all devices,
  separately obtain appropriately licensed webfont files.
- The homepage Facebook button currently opens a Facebook page search,
  not a confirmed direct club page. The direct Messenger link is set to
  https://m.me/supportthedevoted.
- GitHub Pages has bandwidth limits; for very large-scale traffic consider
  a dedicated CDN/static host.

RELEASE PROCESS
Back up existing GitHub Pages website before replacing it. Publishing this
ZIP does not update or overwrite any live repository by itself.
