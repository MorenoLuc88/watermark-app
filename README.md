# LM Watermark — Luc Moreno Photographe

Application de filigrane automatique par lot.
Analyse la luminosité de chaque photo et applique la signature blanc ou noir selon le contraste optimal.

## Démarrage rapide

1. Place tes fichiers **Signature_Blanc.png** et **Signature_noir.png** dans le dossier `assets/`
2. Double-clique sur **LANCER_APP.bat**
3. C'est tout !

## Compiler un .exe installable

Double-clique sur **COMPILER_EXE.bat**
→ génère un installeur dans le dossier `dist/`

## Fonctionnalités

- Import par fichiers ou par dossier entier
- Drag & drop
- Analyse automatique de la luminosité sur la zone du filigrane
- Choix auto blanc/noir selon le contraste
- Réglages : position, taille, opacité, marge, format de sortie, qualité JPEG
- Traitement par lot avec barre de progression
- Suffixe personnalisable sur les fichiers de sortie

## Prérequis

- Windows 10/11 x64
- Node.js 18+ (https://nodejs.org)
