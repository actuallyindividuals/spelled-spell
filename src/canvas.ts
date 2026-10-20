/**
 * The spell canvas: how a spell draws at any moment, on any surface.
 * One implementation for the stage (/s/:id/open), the piece (/p/:id), the
 * preview, and the video renderer.
 *
 * Owns: the renderer (fill | stanza | flow), the fit engine (probe + FLIP),
 * committed/in-progress word wrapping, the caret, typing/done classes, and
 * the authored-break rule — a literal typed \n is a line break, everywhere.
 *
 * Does not own: time (the player) or chrome (each page's).
 */

const RENDERERS = ['fill', 'flow', 'stanza'] as const;
type RendererName = (typeof RENDERERS)[number];

export interface CanvasOpts {
  /** renderer name; falls back to the element's data-renderer, then 'fill' */
  renderer?: string | null;
  /** px of the box currently hidden by page chrome (transport bar, CTA) */
  covered?: () => number;
}

export interface SpellCanvas {
  readonly renderer: RendererName;
  /** draw the text as it stands at some moment; finished = the last op has landed */
  render(text: string, finished: boolean): void;
  /** re-run the fit (page chrome moved, container resized) */
  refit(): void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** the text's direction: that of its first strong letter (Arabic, Hebrew, Persian, Urdu… read right to left) */
const RTL_LETTER = /[\u0591-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
export const direction = (t: string): 'ltr' | 'rtl' => {
  const m = t.match(/[\u0591-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]|\p{L}/u);
  return m && RTL_LETTER.test(m[0]) ? 'rtl' : 'ltr';
};
/** the writer's literal \n is an authored line break */
const authored = (t: string) => t.replace(/\\n/g, '\n');

export function createCanvas(body: HTMLElement, opts: CanvasOpts = {}): SpellCanvas {
  const wanted = opts.renderer ?? body.dataset.renderer ?? '';
  const renderer: RendererName = (RENDERERS as readonly string[]).includes(wanted) ? (wanted as RendererName) : 'fill';
  body.dataset.renderer = renderer;
  body.classList.add(`r-${renderer}`);
  body.closest('.stage, .piece-stage')?.classList.add(`stage-${renderer}`);
  const stanzaMode = renderer === 'stanza';
  const fillMode = renderer === 'fill' || stanzaMode; // both fit their box

  // Committed words (followed by whitespace) never break mid-word; the word
  // still being typed may, so the cursor stays glued to the last letter.
  // stanza only — authored lines are sacred: committed text never soft-wraps
  // (white-space: pre), so the longest line bounds the size. Floor guard:
  // under FLOOR px, wrap with a hanging indent so wrapped ≠ authored.
  const FLOOR = 28;
  let wrapMode = false;
  const committedHtml = (t: string) =>
    stanzaMode && wrapMode ? t.split('\n').map((l) => `<span class="ln">${esc(l)}</span>`).join('\n') : esc(t);
  const writeSplit = (el: HTMLElement, text: string, finished: boolean) => {
    if (!fillMode) { el.innerHTML = `<span>${esc(text)}</span><span class="caret"></span>`; return; }
    const cut = finished ? text.length : text.search(/\S*$/);
    el.innerHTML = `<span class="w">${committedHtml(text.slice(0, cut))}</span><span class="w-ing">${esc(text.slice(cut))}</span><span class="caret"></span>`;
    el.classList.toggle('wrap', stanzaMode && wrapMode);
  };
  let lastText = '';
  let lastFinished = false;

  // Measure on a clone (no transition) so reads reflect the size just set,
  // then apply to the real element, which glides there via CSS.
  let probe: HTMLElement | null = null;
  const fitNow = () => {
    const box = body.parentElement as HTMLElement;
    if (!probe) {
      probe = body.cloneNode(false) as HTMLElement;
      probe.id = '';
      probe.removeAttribute('aria-live');
      probe.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;transition:none;height:auto;';
      box.appendChild(probe);
    }
    // mirror classes (incl. the cursor) so the probe wraps exactly like the real thing
    probe.className = body.className + ' typing';
    probe.dir = body.dir;
    probe.innerHTML = body.innerHTML;
    probe.style.width = body.clientWidth + 'px'; // identical wrapping width to the real element
    const rtl = body.dir === 'rtl';
    const covered = opts.covered?.() ?? 0;
    // available space is the box's *content* area (its padding is the margin around the text)
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // the bottom padding already reserves the bar's usual room; only subtract what sticks out above it
    const maxH = box.clientHeight - padY - Math.max(0, covered - parseFloat(cs.paddingBottom)), maxW = box.clientWidth - padX;
    const cap = Math.min(400, Math.floor(maxH * 0.6)); // one word shouldn't be taller than the room
    const fits = (px: number) => {
      probe!.style.fontSize = px + 'px';
      // measure the ink, not scrollWidth (Chrome ignores inline `pre` overflow there)
      const range = document.createRange();
      range.selectNodeContents(probe!);
      const ink = range.getBoundingClientRect();
      const pb = probe!.getBoundingClientRect();
      // text starts at the left (ltr) or the right (rtl) edge; overflow spills past the other one
      if (Math.max(ink.right - pb.left, pb.right - ink.left) > maxW + 0.5 || ink.bottom - pb.top > maxH + 0.5) return false;
      // the caret must sit on the same line as the last glyph — never alone on a new line
      const caret = probe!.querySelector<HTMLElement>('.caret');
      const txt = probe!.textContent ?? '';
      if (caret && txt.length && !txt.endsWith('\n')) {
        const walker = document.createTreeWalker(probe!, NodeFilter.SHOW_TEXT);
        let last: Text | null = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).length) last = n as Text;
        if (last && last.parentElement?.closest('.caret') === null) {
          const r = document.createRange();
          r.setStart(last, last.length - 1);
          r.setEnd(last, last.length);
          const g = r.getBoundingClientRect();
          const c = caret.getBoundingClientRect();
          // the caret sits after the last glyph: to its right (ltr) or its left (rtl); anywhere else → it wrapped
          if (rtl ? c.right > g.left + 1 : c.left < g.right - 1) return false;
        }
      }
      return true;
    };
    const search = () => {
      let lo = 14, hi = cap;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      return lo;
    };
    let lo = search();
    // pass 2 (stanza): too small with authored lines unbroken → allow wrapping (hanging indent) and refit
    const wantWrap = stanzaMode && Math.floor(lo * 0.96) < FLOOR;
    if (wantWrap !== wrapMode) {
      wrapMode = wantWrap;
      writeSplit(body, lastText, lastFinished);
      probe.className = body.className + ' typing';
      probe.dir = body.dir;
      probe.innerHTML = body.innerHTML;
      lo = search();
    }
    // 4% slack so the cursor/last glyph never tips a line over the edge
    const next = Math.floor(lo * 0.96);
    const prev = parseFloat(body.style.fontSize);
    if (!prev) { body.style.fontSize = next + 'px'; return; } // first fit: no animation
    if (next === prev) return;
    // FLIP: commit the new size instantly (so wrapping is final), then animate
    // a transform from the old visual scale to 1. Transforms don't reflow, so
    // the line breaks never change mid-animation.
    body.style.fontSize = next + 'px';
    body.style.transition = 'none';
    body.style.transform = `scale(${prev / next})`;
    void body.offsetWidth; // flush
    body.style.transition = 'transform 160ms ease-out';
    body.style.transform = 'scale(1)';
  };
  const refit = () => {
    if (fillMode) fitNow();
  };
  if (fillMode) window.addEventListener('resize', refit);

  return {
    renderer,
    render(text, finished) {
      lastText = authored(text);
      lastFinished = finished;
      // the writing sets its own direction: an Arabic spell runs right to left, caret and end mark on the left
      const dir = direction(lastText);
      if (body.dir !== dir) body.dir = dir;
      body.classList.toggle('rtl', dir === 'rtl');
      writeSplit(body, lastText, finished);
      body.classList.toggle('typing', !finished);
      body.classList.toggle('done', finished);
      refit();
    },
    refit,
  };
}
