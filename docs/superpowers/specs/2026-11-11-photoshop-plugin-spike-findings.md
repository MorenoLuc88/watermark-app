# Plugin Photoshop « LM Signature » — résultats de l'essai (Tâche 2)

Mesurés le 2026-11-11 sur le Photoshop de Luc : **Photoshop 2027, version 28.0.0** (Windows), via le plugin d'essai installé en `.ccx`. Document : 3648 × 5472 px, 240 ppp, RVB 8 bits, profil sRGB. Journal brut : `%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\28\External\com.lucmoreno.signature.spike\PluginData\spike-log.txt`.

| Sonde | Résultat | Conséquence pour le plan |
|---|---|---|
| P1 composite | `imaging.getPixels({ documentID, sourceBounds, colorSpace: "RGB", componentSize: 8, colorProfile: "sRGB IEC61966-2.1" })` sans `layerID` renvoie la zone demandée (1094 × 406). **Composite confirmé** : après avoir posé la signature blanche, la moyenne passe de 223 à 224, ce que le calcul prédit (12 112 pixels blancs sur 444 164). Le résultat a **3 composantes** (sans alpha) sur un document à un seul calque, et **4 composantes** (alpha à 255) quand le document a plusieurs calques. | `readCompositeRegion` doit accepter 3 ou 4 canaux (`chooseColor` le fait déjà). |
| P2 calque seul | Lecture d'un calque pixel avec `layerID` : OK. | — |
| P3 pose | `placeEvent` (`batchPlay`, `linked: false`, jeton `createSessionToken` d'un fichier du dossier du plugin) crée un **objet dynamique**. `layer.scale(pct, pct, TOPLEFT)`, `layer.translate(dx, dy)`, `layer.opacity`, `layer.name` fonctionnent. | Méthode validée. |
| P3 bornes | **`layer.bounds` exclut les marges transparentes** (zone visible uniquement, alpha > 0). Le PNG posé mesure 2000 × 586 px visibles (240 ppp / 72 ppp × 600 × 176). Les marges ne sont pas dans les bornes. | La position se calcule sur la **zone visible** : `profile.content` = `{ left: 104, top: 64, width: 600, height: 176 }` (en px du PNG 820 × 304), mis à l'échelle de la boîte. |
| P3/P4 historique | `executeAsModal` avec `historyStateInfo` n'a **pas** regroupé : +5 états. | Remplacé par `suspendHistory` (P7). |
| P7 plan complet | `ctx.hostControl.suspendHistory({ documentID, name })` puis `resumeHistory(id)` : **1 seul état d'historique**. Position obtenue : left 2663, top 5121, right 3462, bottom 5356 pour 2663 / 5121 / 3463 / 5356 attendus : **écart de 1 px sur la largeur**, imperceptible. | Méthode retenue. Tolérance de ±1 px acceptée. |
| P8 pixels d'un objet dynamique | `getPixels` avec `layerID` sur le calque de signature : 4 composantes avec alpha, 799 × 235, moyenne des pixels opaques (255, 255, 255) pour la signature blanche. | `detectLayerColor` lit les pixels du calque : luminance moyenne des pixels opaques. |
| P9 calques | `doc.layers` + `layer.layers` (groupes) parcourables ; `layer.delete()` fonctionne. Un groupe a `kind: "group"`. | `findSignatureLayer` parcourt les groupes. |
| P5 document | `d.mode` = `"RGBColorMode"` (chaîne) ; `d.bitsPerChannel` = `"bitDepth8"` (chaîne) ; `constants.DocumentMode` : `BITMAP, CMYK, DUOTONE, GRAYSCALE, INDEXEDCOLOR, LAB, MULTICHANNEL, RGB` ; `constants.BitsPerChannelType` : `ONE, EIGHT, SIXTEEN, THIRTYTWO`. `d.width`, `d.height` : nombres en **pixels**. | `getDocument` normalise : mode = nom de la constante (`"RGB"`), profondeur = 1, 8, 16 ou 32. |
| P6 environnement | `require("./fichier.js")` OK ; `localStorage` OK ; `atob` OK ; `Buffer` et `TextDecoder` **absents**. `navigator.clipboard` exige une permission de manifest. | `profile.js` utilise déjà `atob`. Aucun presse-papiers. |

## Autres constats
- Photoshop rejette un manifest dont les icônes à plusieurs échelles ne suivent pas le nommage `nom@1x.png`, `@1.25x`, `@1.5x`, `@2x`. Le chargement par UXP Developer Tool a échoué (« Plugin rejected … invalid object ») ; l'installation d'un `.ccx` (méthode habituelle de Luc, comme Backdrop Clean) fonctionne.
- Lecture 16 bits (`componentSize: 8` sur un document 16 bits) non testée : à vérifier à la recette (Tâche 9).
