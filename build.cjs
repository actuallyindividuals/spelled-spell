/** Build: src/browser.ts → dist/spell.js, an IIFE exposing `Spelled` (createCanvas, createMovie, …) for pages without a bundler. */
const path = require('path');
const esbuild = require('esbuild');
esbuild.build({
  entryPoints: [path.join(__dirname, 'src/browser.ts')],
  outfile: path.join(__dirname, 'dist/spell.js'),
  bundle: true, platform: 'browser', target: 'es2020', format: 'iife', globalName: 'Spelled',
  minify: true, logLevel: 'warning',
}).then(() => console.log('[spell] dist/spell.js written')).catch((e) => { console.error(e); process.exit(1); });
