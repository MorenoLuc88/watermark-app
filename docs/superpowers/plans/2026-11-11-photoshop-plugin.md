# Plugin Photoshop « LM Signature » — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases `- [ ]`.

**Objectif :** un panneau Photoshop 26 qui, en un clic, choisit la signature blanche ou noire la plus lisible sous le coin choisi et la pose sur un calque « Signature LM ».

**Architecture :** toute la logique (placement, contraste, réglages, enchaînement des actions) est en JavaScript pur, testable avec `node --test`. Une fine couche `ps.js` est le seul fichier qui parle à Photoshop ; le reste lui est injecté (ce qui permet de tester l'enchaînement avec un faux Photoshop). Le calcul de contraste est un portage de `processor.js`, avec un test de parité contre lui.

**Stack :** Photoshop UXP (manifest v5), JavaScript CommonJS, `node:test` (aucune nouvelle dépendance), `sharp` (déjà dans le dépôt) uniquement pour les outils et les tests, jamais dans le plugin.

**Spec :** [docs/superpowers/specs/2026-11-11-photoshop-plugin-design.md](../specs/2026-11-11-photoshop-plugin-design.md) — à lire avant de commencer.

## Contraintes globales

- Cible : Photoshop **26**, **Windows** ; plugin **UXP**, `manifestVersion: 5`, dossier **`photoshop-plugin/`** du dépôt.
- Valeurs par défaut : position **bas droite**, taille **30 %** du **plus petit côté** (appliquée à la **largeur complète du PNG, marges transparentes comprises** ; marge et position calculées sur cette boîte), opacité **100 %**, marge **30 px**.
- Nom du calque : **« Signature LM »**. Opacité réglée **sur le calque**, jamais fusionnée dans les pixels. Signature posée comme **objet dynamique intégré**.
- Lecture des pixels **uniquement sur la zone sous la signature**, jamais l'image entière.
- Le choix de couleur reprend `processor.js` (`scoreReadability`) : contraste WCAG plafonné à **4,5**, pondéré par l'alpha de la signature, avec la couleur réelle de chaque signature ; blanc gagne à égalité.
- Modes pris en charge : RGB **8 et 16 bits**. Autres modes : message clair, pas de résultat faux.
- Interface et messages **en français**. Aucun réseau, aucune télémétrie, aucun compte.
- Les deux PNG sont **copiés dans `photoshop-plugin/assets/`** (source : `Y:\Signature_Blanc.png`, `Y:\Signature_noir.png`, 820 × 304 px).
- L'appli Electron n'est pas modifiée, sauf l'exclusion de `photoshop-plugin/**` et `docs/**` de l'exe (Tâche 1).
- Workflow : branche `feat/photoshop-plugin` (créée depuis `docs/photoshop-plugin-design`), commits fréquents, une PR ; **`@codex review` demandé à l'ouverture de la PR et après chaque push de correction**.

## Points à vérifier dans Photoshop (la Tâche 2 y répond ; si un résultat contredit ce plan, réviser les Tâches 7 à 9 avant de continuer)

Le plan suppose ceci de l'API UXP, à confirmer : `imaging.getPixels` sans `layerID` renvoie le composite visible ; `layer.bounds` d'un objet dynamique inclut les marges transparentes ; `placeEvent` + `layer.scale` + `layer.translate` donnent une taille et une position exactes ; `executeAsModal` avec `historyStateInfo` produit un seul état d'historique ; `document.width/height` sont en pixels.

## Focus de relecture (cas que la spec sous-entend)

1. **Aucun document ouvert** : message clair, aucune exception brute (test Tâche 7).
2. **Signature plus grande que l'image** (petit document, taille 50 %, grande marge) : la boîte reste entièrement dans l'image (test Tâche 4).
3. **Modes non RGB** (CMYK, niveaux de gris, 32 bits) : message, rien n'est posé ; RGB 16 bits fonctionne (test Tâche 7).
4. **Deux clics sur « Signer »** : un seul calque, et la signature existante ne fausse pas la mesure (test Tâche 7).
5. **Pixels transparents** (calque sans fond) : comptés comme **blancs** (aplatissement JPEG), pas comme noirs (test Tâche 5).

---

## Structure des fichiers

```
photoshop-plugin/
  manifest.json                    Tâche 1
  index.html                       Tâche 8   panneau
  assets/Signature_Blanc.png       Tâche 1   copie de Y:\
  assets/Signature_noir.png        Tâche 1
  assets/signature-profile.js      Tâche 3   généré (masque alpha réduit + luminances)
  src/profile.js                   Tâche 3   decodeProfile, loadProfile
  src/placement.js                 Tâche 4   computeBox
  src/contrast.js                  Tâche 5   chooseColor
  src/settings.js                  Tâche 6   DEFAULT_SETTINGS, normalizeSettings
  src/sign.js                      Tâche 7   SignError, createSigner
  src/ps.js                        Tâche 7   seule couche qui parle à Photoshop
  src/messages.js                  Tâche 8   errorMessage
  src/panel.js                     Tâche 8   interface
  tools/build-signature-profile.js Tâche 3   (Node + sharp)
  tests/*.test.js                  une par module
  spike/                           Tâche 2   jetable, supprimé en Tâche 9
```

---

### Tâche 1 : Squelette, signatures, lancement des tests

**Fichiers :**
- Créer : `photoshop-plugin/manifest.json`, `photoshop-plugin/assets/Signature_Blanc.png`, `photoshop-plugin/assets/Signature_noir.png`, `photoshop-plugin/tests/smoke.test.js`
- Modifier : `package.json` (script `test:plugin`, exclusions `build.files`), `.gitignore` (`*.ccx`)

**Interfaces :** Produit : la commande `npm run test:plugin` (= `node --test "photoshop-plugin/tests/*.test.js"`), utilisée par toutes les tâches suivantes.

- [ ] **Étape 1 :** Copier les deux PNG depuis `Y:\` vers `photoshop-plugin/assets/` (vérifier 820 × 304, alpha).
- [ ] **Étape 2 :** Écrire `manifest.json` : `manifestVersion: 5`, `id: "com.lucmoreno.signature"`, `name: "LM Signature"`, `version: "1.0.0"`, `host: { app: "PS", minVersion: "26.0.0" }`, `main: "index.html"`, un point d'entrée `panel` (id `lmSignaturePanel`, libellé « LM Signature »), permission `localFileSystem: "plugin"`.
- [ ] **Étape 3 :** Écrire `tests/smoke.test.js` : le manifest est un JSON valide avec `manifestVersion === 5` et `host.app === "PS"` ; les deux PNG existent.
- [ ] **Étape 4 :** Ajouter dans `package.json` le script `"test:plugin": "node --test \"photoshop-plugin/tests/*.test.js\""` et `"!photoshop-plugin/**"`, `"!docs/**"` dans `build.files`. Ajouter `*.ccx` à `.gitignore`.
- [ ] **Étape 5 :** Lancer `npm run test:plugin`. Attendu : 1 test passe, 0 échec.
- [ ] **Étape 6 :** Commit `chore: scaffold photoshop-plugin (manifest, signatures, test runner)`.

---

### Tâche 2 : Essai dans Photoshop (jetable, ne sera pas conservé)

Cette tâche **demande à Luc de lancer le plugin d'essai dans Photoshop** et de relever les résultats. Elle lève les risques de la spec avant d'écrire le reste.

**Fichiers :**
- Créer : `photoshop-plugin/spike/manifest.json`, `photoshop-plugin/spike/index.html`, `photoshop-plugin/spike/probe.js`, `docs/superpowers/specs/2026-11-11-photoshop-plugin-spike-findings.md`

**Interfaces :** Produit : le document de résultats, que les Tâches 7 et 8 consultent. Chaque sonde affiche `OK` / `ÉCHEC` et les valeurs brutes dans le panneau.

- [ ] **Étape 1 :** Écrire un petit panneau UXP (son propre manifest, id `com.lucmoreno.signature.spike`) avec un bouton par sonde et un journal à l'écran, que Luc charge via UXP Developer Tool (« Add Plugin » puis « Load »).
- [ ] **Étape 2 :** Sonde **P1 composite** : `imaging.getPixels({ documentID, sourceBounds: <zone 1094 × 405 en bas à droite>, colorSpace: "RGB", componentSize: 8, colorProfile: "sRGB IEC61966-2.1" })` sans `layerID`. Afficher largeur, hauteur, nombre de canaux, moyenne R/G/B. Attendu sur une photo sombre : moyenne basse ; avec un calque supérieur masqué ou affiché, la valeur doit changer (preuve que c'est bien le composite).
- [ ] **Étape 3 :** Sonde **P2 calque seul** : même lecture avec `layerID` du calque actif ; afficher la moyenne. Sert à `detectLayerColor`.
- [ ] **Étape 4 :** Sonde **P3 pose** : placer `assets/Signature_Blanc.png` (dossier du plugin, `createSessionToken` + `batchPlay` `placeEvent`) comme objet dynamique intégré, le mettre à une largeur de 1094 px avec `layer.scale` puis à une position choisie avec `layer.translate`, régler `layer.opacity` et `layer.name`. Afficher `layer.bounds` obtenu **et** attendu : les marges transparentes sont-elles dans les bornes ? la précision est-elle au pixel ?
- [ ] **Étape 5 :** Sonde **P4 historique** : exécuter P3 dans `core.executeAsModal(..., { commandName: "Signer", historyStateInfo: { name: "Signer", target: doc } })` ; afficher le nombre d'états d'historique ajoutés (attendu : 1).
- [ ] **Étape 6 :** Sonde **P5 document** : afficher `doc.id`, `doc.width`, `doc.height`, `doc.mode`, `doc.bitsPerChannel` (valeurs et types bruts), sur un document RGB 8 bits puis 16 bits.
- [ ] **Étape 7 :** Sonde **P6 environnement** : `require` d'un fichier `.js` local fonctionne ; `localStorage` écrit et relu ; version de Photoshop affichée.
- [ ] **Étape 8 :** Luc lance les six sondes sur une de ses photos ouvertes et colle le journal. Écrire `…-spike-findings.md` : pour chaque sonde, résultat et conséquence sur le plan (noms exacts des constantes de mode, unités, bornes avec ou sans marges, méthode de repli si P1 échoue).
- [ ] **Étape 9 :** Commit `spike: probes for Photoshop 26 UXP behaviour (throwaway)`. Ne pas pousser tant que Luc n'a pas confirmé les résultats.

---

### Tâche 3 : Profil des signatures (masque alpha et luminances)

Photoshop ne peut pas décoder un PNG en JavaScript pur sans `sharp` : un outil de développement précalcule ce qu'il faut.

**Fichiers :**
- Créer : `photoshop-plugin/tools/build-signature-profile.js`, `photoshop-plugin/assets/signature-profile.js` (généré), `photoshop-plugin/src/profile.js`
- Test : `photoshop-plugin/tests/profile.test.js`

**Interfaces :**
- Produit : `decodeProfile(raw) -> Profile` et `loadProfile() -> Profile` (dans `src/profile.js`), avec
  `Profile = { width: number, height: number, mask: { width: number, height: number, alpha: Uint8Array }, luminance: { white: number, black: number } }`.
  `width/height` = dimensions du PNG (820 × 304). `mask` = alpha réduit au quart (205 × 76). `luminance` = luminance **linéaire** (0–1) moyenne des pixels opaques, pondérée par l'alpha, de chaque PNG.
- `assets/signature-profile.js` exporte (`module.exports`) l'objet brut `{ width, height, maskWidth, maskHeight, alphaBase64, luminance: { white, black } }`.

- [ ] **Étape 1 : écrire le test qui échoue** `profile.test.js` : `loadProfile()` renvoie `width 820`, `height 304`, `mask.width 205`, `mask.height 76`, `mask.alpha.length === 205 * 76` ; `luminance.white > 0.95` et `luminance.black < 0.05` ; au moins 3 % et au plus 60 % des valeurs du masque sont non nulles (la signature est un tracé fin : l'alpha moyen d'un bloc peut rester sous 128, donc ne pas seuiller à 128) ; le masque est vide dans les 20 premières colonnes (marge gauche transparente).
- [ ] **Étape 2 :** Lancer `npm run test:plugin`. Attendu : échec (`profile.js` absent).
- [ ] **Étape 3 :** Écrire `tools/build-signature-profile.js` (Node + `sharp`) : lit les deux PNG, réduit l'alpha au quart (moyenne par bloc 4 × 4), calcule les luminances avec la même formule que `processor.js` (table sRGB linéaire, `0.2126 / 0.7152 / 0.0722`), écrit `assets/signature-profile.js`. L'exécuter (`node photoshop-plugin/tools/build-signature-profile.js`).
- [ ] **Étape 4 :** Écrire `src/profile.js` : `decodeProfile` décode le base64 en `Uint8Array` **sans API Node** (pas de `Buffer` : utiliser `atob`, disponible dans UXP) ; `loadProfile` appelle `decodeProfile(require("../assets/signature-profile.js"))`.
- [ ] **Étape 5 :** Lancer les tests. Attendu : tous passent.
- [ ] **Étape 6 :** Commit `feat(plugin): precomputed signature profile (alpha mask, luminances)`.

---

### Tâche 4 : Calcul de la boîte de la signature

**Fichiers :** Créer `photoshop-plugin/src/placement.js` ; Test `photoshop-plugin/tests/placement.test.js`

**Interfaces :**
- Produit : `POSITIONS: string[]` (`bottom-right`, `bottom-left`, `bottom-center`, `top-right`, `top-left`, `top-center`, `center`) et
  `computeBox({ position, docWidth, docHeight, sizePercent, margin, sourceWidth, sourceHeight }) -> { left, top, width, height }` (entiers, boîte toujours dans le document).

- [ ] **Étape 1 : écrire les tests qui échouent** (`placement.test.js`) :
  - `portrait 3648x5472, 30 %, marge 30, bas droite` → `width 1094`, `height 406`, `left 3648 - 1094 - 30`, `top 5472 - 406 - 30`.
  - **Parité avec l'appli** : pour les 7 positions et 3 formats (3648×5472, 5472×3648, 1200×800), `computeBox` donne les mêmes `left/top` que `computePlacement` de `../../processor.js` avec la même largeur et hauteur de signature.
  - **Focus 2** : `docWidth 100, docHeight 60, sizePercent 50, margin 500` → la boîte est entièrement dans `[0, 100] × [0, 60]`, `left >= 0`, `top >= 0`, `left + width <= 100`, `top + height <= 60`.
  - Un `position` inconnu retombe sur `bottom-right`.
- [ ] **Étape 2 :** Lancer les tests. Attendu : échec.
- [ ] **Étape 3 :** Implémenter `computeBox` en suivant `processor.js` (`processPhoto` et `computePlacement`) : largeur = `round(min(docWidth, docHeight) * sizePercent / 100)` ; hauteur = `max(1, round(largeur * sourceHeight / sourceWidth))` ; si la boîte dépasse le document, la réduire proportionnellement (`floor`) ; position puis bornage dans le document.
- [ ] **Étape 4 :** Lancer les tests. Attendu : tous passent.
- [ ] **Étape 5 :** Commit `feat(plugin): signature box placement (parity with app)`.

---

### Tâche 5 : Choix de la couleur (contraste)

**Fichiers :** Créer `photoshop-plugin/src/contrast.js` ; Test `photoshop-plugin/tests/contrast.test.js`

**Interfaces :**
- Consomme : `Profile` (Tâche 3).
- Produit : `chooseColor({ pixels, channels, width, height, profile, opacity }) -> { color: "white" | "black", scores: { white: number, black: number }, luma: number }`. `pixels` = `Uint8Array | Uint8ClampedArray` de `width * height * channels` (`channels` 3 = RGB, 4 = RGBA), zone sous la signature ; `opacity` de 0 à 100.

- [ ] **Étape 1 : écrire les tests qui échouent** (`contrast.test.js`), avec des images synthétiques `sharp` et les vraies signatures :
  - `fond sombre → white`, `fond clair → black`.
  - **Parité avec l'appli** : pour fond sombre, clair, gris moyen (118) et moitié sombre / moitié claire (colonne blanche couvrant plus de 50 % de la zone), `chooseColor` donne la même couleur que `processPhoto` de `../../processor.js` (lancé avec les PNG de `assets/`), et chaque score est à moins de **0,15** du `contrast` renvoyé par `processPhoto`.
  - **Focus 5** : un tampon RGBA entièrement transparent (alpha 0) est traité comme **blanc** → `color === "black"`.
  - Un pixel RGBA semi-transparent est mélangé sur du blanc avant le calcul.
  - `opacity 100` et `opacity 40` donnent la même couleur sur un fond très sombre ; les scores à 40 sont inférieurs à ceux à 100.
- [ ] **Étape 2 :** Lancer les tests. Attendu : échec.
- [ ] **Étape 3 :** Implémenter `chooseColor` en portant `scoreReadability` de `processor.js` : pour chaque pixel de la zone, retrouver sa valeur dans le masque réduit par **plus proche voisin** (`mx = floor(x * mask.width / width)`) ; aplatir l'alpha de l'image sur du blanc si `channels === 4` ; calcul identique (luminance linéaire du fond, mélange selon `alpha * opacité`, ratio WCAG plafonné à 4,5, moyenne pondérée) ; `luminance` de chaque signature vient du profil ; blanc gagne si `scores.white >= scores.black`. `luma` = luminosité moyenne pondérée sur 0–255 (comme `processor.js`).
- [ ] **Étape 4 :** Lancer les tests. Si un écart de score dépasse 0,15, corriger le portage (pas le seuil).
- [ ] **Étape 5 :** Commit `feat(plugin): contrast-based colour choice (parity with app)`.

---

### Tâche 6 : Réglages

**Fichiers :** Créer `photoshop-plugin/src/settings.js` ; Test `photoshop-plugin/tests/settings.test.js`

**Interfaces :** Produit : `DEFAULT_SETTINGS = { position: "bottom-right", sizePercent: 30, opacity: 100, margin: 30 }` et `normalizeSettings(raw: unknown) -> Settings` (toujours un objet complet et valide).

- [ ] **Étape 1 : écrire les tests qui échouent** : `normalizeSettings(undefined)` et `normalizeSettings("x")` valent `DEFAULT_SETTINGS` ; `{ sizePercent: 999 }` → `50` ; `{ sizePercent: 1 }` → `3` ; `{ opacity: 0 }` → `10` ; `{ margin: -5 }` → `0` ; `{ margin: 400 }` → `150` ; `{ position: "nowhere" }` → `"bottom-right"` ; `{ sizePercent: "abc" }` → `30` ; une valeur numérique en chaîne (`"25"`) est acceptée → `25`.
- [ ] **Étape 2 :** Lancer les tests. Attendu : échec.
- [ ] **Étape 3 :** Implémenter avec les bornes de l'appli : taille 3–50, opacité 10–100, marge 0–150, position dans `POSITIONS`.
- [ ] **Étape 4 :** Lancer les tests. Attendu : passent.
- [ ] **Étape 5 :** Commit `feat(plugin): settings defaults and normalisation`.

---

### Tâche 7 : Enchaînement « Signer » / « Inverser » et couche Photoshop

**Prérequis :** résultats de la Tâche 2 (noms exacts des constantes de mode, unités, bornes). Mettre à jour cette tâche avec eux avant de commencer.

**Fichiers :** Créer `photoshop-plugin/src/sign.js`, `photoshop-plugin/src/ps.js` ; Test `photoshop-plugin/tests/sign.test.js`

**Interfaces :**
- Consomme : `computeBox` (T4), `chooseColor` (T5), `Profile` (T3), `Settings` (T6).
- Produit (`sign.js`) :
  - `class SignError extends Error` avec `code: "NO_DOCUMENT" | "UNSUPPORTED_MODE" | "NO_SIGNATURE" | "PS_ERROR"`.
  - `createSigner({ ps, profile, getSettings }) -> { sign(): Promise<SignResult>, invert(): Promise<SignResult> }`, avec `SignResult = { color: "white" | "black", box: { left, top, width, height }, scores?: { white: number, black: number } }`.
- Interface `ps` (injectée ; implémentée par `ps.js`, simulée dans les tests) :
  - `getDocument(): Promise<null | { id: number, width: number, height: number, mode: string, bitsPerChannel: number }>`
  - `readCompositeRegion(doc, box): Promise<{ pixels: Uint8Array, channels: 3 | 4, width: number, height: number }>`
  - `findSignatureLayer(doc): Promise<null | { id: number, bounds: { left, top, width, height }, opacity: number }>`
  - `removeLayer(doc, layerId): Promise<void>`
  - `detectLayerColor(doc, layerId): Promise<"white" | "black">`
  - `placeSignature(doc, { color, box, opacity }): Promise<void>`
  - `runAsSingleHistoryState(doc, name, fn): Promise<T>`
- Mode pris en charge : `mode` RGB (la valeur exacte est dans les résultats de la Tâche 2) et `bitsPerChannel` 8 ou 16.

- [ ] **Étape 1 : écrire les tests qui échouent** (`sign.test.js`, avec un faux `ps` qui enregistre l'ordre des appels) :
  - `sign sans document ouvert lève NO_DOCUMENT et n'appelle aucune action` (**Focus 1**).
  - `sign refuse CMYK, niveaux de gris et 32 bits (UNSUPPORTED_MODE), accepte RGB 8 et 16 bits` (**Focus 3**).
  - `sign supprime la signature existante avant de lire les pixels` : ordre exact `findSignatureLayer → removeLayer → readCompositeRegion → placeSignature` (**Focus 4**) ; avec une seule signature à la fin.
  - `sign pose la couleur choisie dans la boîte de computeBox avec l'opacité des réglages`.
  - `sign est exécuté dans un seul état d'historique` (un seul appel à `runAsSingleHistoryState`, nom « Signer »).
  - `sign renvoie SignError PS_ERROR si Photoshop lève une exception` (message d'origine conservé dans `cause`).
  - `invert garde la position et l'opacité du calque déplacé par Luc` : le calque existant a des bornes et une opacité 80 non standard ; la nouvelle signature est posée avec exactement ces bornes et cette opacité, dans la couleur opposée à `detectLayerColor`.
  - `invert sans signature lève NO_SIGNATURE`.
- [ ] **Étape 2 :** Lancer les tests. Attendu : échec.
- [ ] **Étape 3 :** Implémenter `sign.js` (dépend uniquement de `ps` injecté, jamais de `require("photoshop")`). Les erreurs inattendues de `ps` sont enveloppées en `SignError("PS_ERROR")`.
- [ ] **Étape 4 :** Lancer les tests. Attendu : passent.
- [ ] **Étape 5 :** Écrire `ps.js` selon les résultats de la Tâche 2 : implémente l'interface `ps` ci-dessus avec `require("photoshop")` (`app`, `core`, `action`, `imaging`) et `require("uxp").storage`. Nom du calque « Signature LM » ; objet dynamique intégré ; lecture limitée à `box` ; `readCompositeRegion` convertit en sRGB 8 bits ; `findSignatureLayer` cherche aussi dans les groupes. Pas de test Node : ce fichier est validé en Tâche 9.
- [ ] **Étape 6 :** Commit `feat(plugin): sign/invert flow and Photoshop adapter`.

---

### Tâche 8 : Panneau

**Fichiers :** Créer `photoshop-plugin/index.html`, `photoshop-plugin/src/panel.js`, `photoshop-plugin/src/messages.js` ; Test `photoshop-plugin/tests/messages.test.js`

**Interfaces :**
- Consomme : `createSigner`, `SignError` (T7), `ps.js` (T7), `loadProfile` (T3), `normalizeSettings`, `DEFAULT_SETTINGS` (T6), `POSITIONS` (T4).
- Produit : `errorMessage(err: unknown) -> string` (`src/messages.js`), message en français par code : `NO_DOCUMENT` « Ouvre une photo avant de signer. », `UNSUPPORTED_MODE` « Ce mode colorimétrique n'est pas pris en charge : passe la photo en RVB 8 ou 16 bits. », `NO_SIGNATURE` « Aucune signature à inverser. », `PS_ERROR` et toute autre erreur « Photoshop a refusé l'opération : » + détail.

- [ ] **Étape 1 : écrire le test qui échoue** (`messages.test.js`) : les quatre messages ci-dessus pour chaque code ; une `Error` quelconque et la valeur `"boom"` ne lèvent pas d'exception et renvoient une chaîne non vide.
- [ ] **Étape 2 :** Lancer les tests. Attendu : échec. Implémenter `messages.js`, relancer. Attendu : passent.
- [ ] **Étape 3 :** Écrire `index.html` et `panel.js` : boutons **« Signer »** (principal) et **« Inverser »** ; ligne d'état (« Signature blanche posée » / « noire », avec les deux scores) ; menu de position (7 options), curseurs de taille (3–50 %), d'opacité (10–100 %), de marge (0–150 px) ; réglages lus et écrits dans `localStorage` (en `try/catch`, via `normalizeSettings`) ; boutons désactivés pendant une opération ; toute erreur affichée via `errorMessage`. Libellés alignés sur l'appli de lot.
- [ ] **Étape 4 :** Lancer toute la suite `npm run test:plugin`. Attendu : tout passe.
- [ ] **Étape 5 :** Commit `feat(plugin): panel UI`.

---

### Tâche 9 : Validation dans Photoshop, paquet, documentation, PR

Cette tâche **demande à Luc** de charger le plugin et de confirmer chaque ligne. Elle ne se termine que quand toutes sont cochées.

**Fichiers :** Modifier `README.md` ; Supprimer `photoshop-plugin/spike/` ; Créer `docs/superpowers/specs/2026-11-11-photoshop-plugin-acceptance.md` (résultats)

- [ ] **Étape 1 :** Charger `photoshop-plugin/` dans UXP Developer Tool (sans le dossier `spike`).
- [ ] **Étape 2 : recette**, notée dans le fichier de résultats, sur les photos de Luc :
  - Portrait 3648 × 5472 sur fond sombre : signature **blanche**, bas droite, texte visible d'environ 800 px, même rendu que l'appli de lot (comparer au `…_wm.jpg`).
  - Paysage 5472 × 3648 : idem.
  - Photo à fond clair dans le coin : signature **noire**. Coin à moitié clair, moitié sombre : le choix est lisible partout (sinon « Inverser »).
  - Deux clics sur « Signer » : un seul calque « Signature LM ». « Inverser » : change la couleur ; après avoir déplacé le calque à la main, « Inverser » garde sa position.
  - `Ctrl+Z` après « Signer » : un seul pas d'annulation.
  - Document 16 bits : fonctionne. CMYK : message clair, rien posé. Aucun document : message clair.
  - Enregistrement en JPEG : la signature est bien dans le fichier ; netteté de l'agrandissement acceptable (sinon le noter comme limite connue).
  - Mesure du temps de clic sur une photo de 20 Mpx : quasi instantané (moins de 2 s).
- [ ] **Étape 3 :** Supprimer `photoshop-plugin/spike/`. Dans UXP Developer Tool, « Package » produit `LM-Signature.ccx` ; Luc l'installe d'un double-clic et le panneau apparaît dans le menu Modules externes. Si l'installation échoue, le noter et rester en mode développement (limite connue).
- [ ] **Étape 4 :** Ajouter à `README.md` une section « Plugin Photoshop » : installation, utilisation, réglages, limites (agrandissement des signatures à 820 px, modes non pris en charge).
- [ ] **Étape 5 :** Lancer `npm run test:plugin` (tout passe) et vérifier qu'`npm run build` n'embarque pas `photoshop-plugin/` ni `docs/` (lire le contenu de `dist/win-unpacked/resources/app.asar` ou `electron-builder --dir`).
- [ ] **Étape 6 :** Commit, push de `feat/photoshop-plugin`, ouvrir la PR, puis commenter **`@codex review`** ; enchaîner les corrections jusqu'à « plus de finding » **uniquement si Luc le redemande pour cette PR**.
