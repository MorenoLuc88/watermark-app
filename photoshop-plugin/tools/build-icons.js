// Outil de développement : dessine les icônes du plugin (pictogramme de signature) aux 4 échelles attendues
// par Photoshop (nom@1x.png, @1.25x, @1.5x, @2x). Même principe que Backdrop Clean :
//   - icône du panneau : pictogramme monochrome (clair pour les thèmes sombres, foncé pour les thèmes clairs)
//   - icône du plugin : carré coloré plein avec le pictogramme en blanc
//   node photoshop-plugin/tools/build-icons.js
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'icons');
const SCALES = [1, 1.25, 1.5, 2];

// Une signature manuscrite soulignée, dans un repère 46 x 46
const SIGNATURE = `
  <path d="M7 30 C9 13 17 9 17 19 C17 28 11 37 18 31 C23 26 23 17 28 19 C32 21 27 30 31 29 C35 28 36 23 40 22"
        fill="none" stroke="COLOR" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 39 C18 35.500 29 38 39 34.500" fill="none" stroke="COLOR" stroke-width="2.600" stroke-linecap="round"/>`;

const panelSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46">${SIGNATURE.replace(/COLOR/g, color)}</svg>`;

const pluginSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46">
  <rect x="1" y="1" width="44" height="44" rx="10" fill="#3f51d6"/>
  <g transform="translate(3.500 1) scale(0.850)">${SIGNATURE.replace(/COLOR/g, '#ffffff')}</g>
</svg>`;

async function writeScaled(svg, name, base) {
  for (const s of SCALES) {
    const px = Math.round(base * s);
    await sharp(Buffer.from(svg), { density: 600 }).resize(px, px).png().toFile(path.join(DIR, `${name}@${s}x.png`));
  }
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f));
  await writeScaled(panelSvg('#e6e6e6'), 'panel-dark', 23);   // thèmes sombres
  await writeScaled(panelSvg('#3a3a3a'), 'panel-light', 23);  // thèmes clairs
  await writeScaled(pluginSvg, 'plugin', 24);
  console.log('Icônes écrites dans', DIR, ':', fs.readdirSync(DIR).length, 'fichiers');
})();
