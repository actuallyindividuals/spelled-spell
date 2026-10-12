# @spelled/spell

How a spell draws and plays — the rendering code from [spelled.dev](https://spelled.dev).

A spell is text plus the timeline of how it was written: every keystroke, deletion and pause as an op.
This package replays one: the **movie** is the clock, the **canvas** draws the text at each moment
(sized to fill its box, or flowing as a page), and when the last op lands the caret becomes a full stop
that turns into the red end mark.

```sh
npm install @spelled/spell
```

## Use

```html
<div class="stage" style="position: relative; height: 60vh">
  <article id="body" class="spell-body stage-body f-serif f-l f-left f-asis f-normal f-black"></article>
</div>
```

```js
import { createCanvas, createMovie } from '@spelled/spell';
import '@spelled/spell/spell.css';

const spell = {
  renderer: 'fill',
  timeline: {
    v: 1,
    ops: [
      { k: 'ins', p: 0, v: 'h', t: 0 },
      { k: 'ins', p: 1, v: 'i', t: 180 },
    ],
  },
};

const canvas = createCanvas(document.getElementById('body'), { renderer: spell.renderer });
const movie = createMovie(spell.timeline, (text, index) => canvas.render(text, index >= spell.timeline.ops.length));
movie.playFrom(0);
```

Without a bundler, load the browser build. It exposes the same API as a global `Spelled`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@spelled/spell/dist/spell.css">
<script src="https://cdn.jsdelivr.net/npm/@spelled/spell/dist/spell.js"></script>
<script>
  const canvas = Spelled.createCanvas(document.getElementById('body'));
</script>
```

## The timeline

| op  | fields       | does                                  |
| --- | ------------ | ------------------------------------- |
| ins | `p`, `v`     | insert `v` at position `p`            |
| del | `p`, `n`     | delete `n` characters at `p`          |
| rep | `p`, `n`, `v`| replace `n` characters at `p` with `v` |

Every op has `t`, the time in milliseconds since writing began. The movie caps pauses longer than
`GAP` (2.5 s) so long thinks stay watchable.

## API

- `createMovie(timeline, render)` returns a `Movie`: `playFrom(t)`, `pause()`, `toggle()`, `paint(t)`,
  `subscribe(fn)`, plus `D` (the duration on the movie's time axis), `t`, `playing`, `finished`.
  `render(text, index, finished)` is called on every frame.
- `createCanvas(body, { renderer })` returns a `SpellCanvas`: `render(text, finished)` and `refit()`.
  `renderer` is `'fill'` (the words grow to fill the box), `'stanza'` (fill, keeping the writer's line
  breaks) or `'flow'` (a page at the writer's size). The box is `body`'s parent.
- `fmt(ms)` formats a duration like `0m07s`.

## CSS

`spell.css` has the canvas, the caret, the end mark and the format classes:

- **Face:** `f-serif`, `f-sans`, `f-mono`, `f-display`, `f-hand`
- **Size:** `f-s` to `f-xl`
- **Align:** `f-left`, `f-center`, `f-right`
- **Case:** `f-asis`, `f-upper`, `f-lower`
- **Spacing:** `f-tight` to `f-poem`
- **Ink:** `f-black`, `f-red`, `f-invert`

Load the fonts you use (Libre Caslon Text, Inter, IBM Plex Mono, Anton, Caveat).

On a dark page, set `--spell-ink: #fff`. It sets black ink and the full stop before the end mark.
`--hot` sets the end mark's red (default `#ff4c4c`).

## License

MIT
