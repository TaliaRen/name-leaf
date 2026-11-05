# Leaf Letters

An autumn forest floor seen from above. Whatever you type is spelled out in fallen leaves — maple, ginkgo, oak and birch — that drift down from the canopy and gather into letters. Everything is drawn and voiced in the browser: the leaves, the dappled sunlight through the trees, the little creatures on the ground and every sound.

Works with Latin letters and Chinese characters, on desktop and on phones.

## How to play

| Gesture | What happens |
| --- | --- |
| Type | Leaves are carried in on the wind and form the letters |
| Delete (Backspace) | A gust lifts the letter's leaves and blows them away |
| Tap a letter | You step on it: the leaves crunch and break, and a breeze carries the pieces off |
| Double-tap | The words are buried under a heap of falling leaves, then the wind clears everything away |
| Hold a letter | Its leaves wither — red ones first, green ones last — break up and sink into the soil |
| Tap the ground | Drops a pine cone; a squirrel may come and take it |
| Drag | Leaves footprints in the soil |
| Space | Keeps a space, and one to three big leaves let go of the canopy |
| Enter | Starts a new line |

On desktop, gliding the mouse over the ground turns the leaves it brushes. The buttons at the bottom show the tips again, bring up the keyboard (on phones) and save the scene as a PNG.

## Run it locally

The page loads fonts and ES modules, so it has to be served over HTTP (opening `index.html` directly won't work):

```bash
python3 serve.py
```

Then open <http://localhost:5178>. To try it on a phone, open your computer's IP address on the same network and tap the screen to bring up the keyboard.

`serve.py` is a tiny static server that turns off caching, so a refresh always picks up your latest changes. Any other static server works too.

## How it works

- `js/glyph.js` — reads each character's outline with opentype.js, rasterises it, builds a distance field and places leaf targets with Poisson-disk sampling.
- `js/leafAtlas.js` — paints the leaf atlas procedurally (edge distance, veins, mottling and alpha for each species).
- `js/main.js` — the scene: a single instanced mesh of leaves and their states (falling, resting, blown away, crushed, withering), the leaf shader, gestures and image export.
- `js/background.js` — the painted forest floor, the dappled canopy light shared by every layer, the warm haze and drifting motes.
- `js/bugs.js`, `js/squirrel.js` — the ladybirds, the snail and the squirrel.
- `js/sound.js` — all sound effects synthesised with the Web Audio API (no audio files).
- `vendor/` — three.js r160 and opentype.js 1.3.4, bundled so the page works offline.

## Fonts

- **Sorts Mill Goudy** (Barry Schwartz) — Latin letters and digits, and the title. SIL Open Font License.
- **千图笔锋手写体** (Qiantu Bifeng, a brush-pen handwriting font from Qiantu) — Chinese characters, subset to the common GB2312 set plus ASCII. Free font; please check its terms before reusing it elsewhere.

Characters missing from both fonts fall back to the system font.
