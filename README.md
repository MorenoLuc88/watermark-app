# LM Watermark

> Application desktop Windows de filigrane automatique par lot pour photographes.

Analyse la luminosité de chaque photo et applique automatiquement le filigrane blanc ou noir selon le contraste de la zone — pour un résultat optimal quelle que soit la photo.

---

## Fonctionnalités

- **Analyse intelligente** — mesure le contraste réel (ratio WCAG) de chaque filigrane sur la zone exacte où il sera posé, en tenant compte de sa forme et de son opacité, et garde le plus lisible
- **Photos fidèles** — l'orientation EXIF est respectée (portraits) et les métadonnées (EXIF, copyright, profil colorimétrique) sont conservées en JPEG, PNG et WebP (en sortie TIFF, seul le profil colorimétrique l'est : l'EXIF n'est pas supporté)
- **Traitement par lot** — importe un dossier entier ou une sélection de fichiers, 2 photos en parallèle, avec bouton d'arrêt
- **Réglages mémorisés** — position, taille, opacité, etc. sont retrouvés au prochain lancement
- **Drag & drop** — glisse tes photos directement dans l'app
- **Filigranes personnalisables** — charge tes propres PNG (mémorisés entre les sessions)
- **Réglages fins** — position (7 options), taille, opacité, marge, format de sortie, qualité JPEG, suffixe
- **Taille adaptative** — le filigrane est proportionnel à la plus petite dimension, cohérent entre portrait et paysage
- **Formats supportés** — JPG, PNG, WebP, TIFF en entrée et en sortie

---

## Téléchargement

👉 [Télécharger le dernier .exe (Releases)](../../releases/latest)

Aucune installation requise — exécutable portable, double-clic et c'est parti.

---

## Utilisation

1. Lance `LM Watermark.exe`
2. Clique sur **Filigrane blanc** et **Filigrane noir** pour charger tes PNG (mémorisés pour les prochaines fois)
3. Importe tes photos via le bouton ou par glisser-déposer
4. Ajuste les réglages si besoin
5. Clique **Appliquer les filigranes**

---

## Développement

### Prérequis

- Windows 10/11 x64
- [Node.js 18+](https://nodejs.org)

### Lancer en mode dev

```bash
git clone https://github.com/ton-pseudo/lm-watermark.git
cd lm-watermark
npm install
```

Puis double-clique sur `LANCER_APP.bat` — ou :

```bash
npx electron .
```

### Compiler le .exe

```bash
npm run build
```

Ou double-clique sur `COMPILER_EXE.bat` → le `.exe` est généré dans `dist/`.

---

## Stack

- [Electron](https://www.electronjs.org/) — framework desktop
- [Sharp](https://sharp.pixelplumbing.com/) — traitement d'image haute performance
- [electron-builder](https://www.electron.build/) — packaging Windows

---

*Développé par [Luc Moreno](https://github.com/MorenoLuc88)*