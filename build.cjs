/**
 * Build → dist/:
 *   index.js + *.d.ts  the ES module (for bundlers: import { createCanvas, createMovie } from '@spelled/spell')
 *   spell.js           an IIFE exposing `Spelled`, for pages without a bundler (<script src>)
 *   spell.css          the spell CSS (import '@spelled/spell/spell.css')
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const src = path.join(__dirname, 'src'), dist = path.join(__dirname, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
const common = { bundle: true, platform: 'browser', target: 'es2020', logLevel: 'warning' };
Promise.all([
  esbuild.build({ ...common, entryPoints: [path.join(src, 'index.ts')], outfile: path.join(dist, 'index.js'), format: 'esm' }),
  esbuild.build({ ...common, entryPoints: [path.join(src, 'browser.ts')], outfile: path.join(dist, 'spell.js'), format: 'iife', globalName: 'Spelled', minify: true }),
]).then(() => {
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(__dirname, 'tsconfig.build.json')], { stdio: 'inherit' });
  fs.rmSync(path.join(dist, 'browser.d.ts'), { force: true });
  fs.copyFileSync(path.join(src, 'spell.css'), path.join(dist, 'spell.css'));
  console.log('[spell] dist/ written: index.js, *.d.ts, spell.js, spell.css');
}).catch((e) => { console.error(e); process.exit(1); });
