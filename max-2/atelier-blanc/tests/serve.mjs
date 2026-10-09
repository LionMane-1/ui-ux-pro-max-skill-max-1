/* `npm start` — serve the site locally. There is no build step; this exists
   only because ES module `<use href="#…">` and relative asset paths behave
   more like production over http:// than over file://. */
import { serve } from './helpers.mjs';

const { base } = await serve();
console.log(`Atelier Blanc running at ${base}`);
