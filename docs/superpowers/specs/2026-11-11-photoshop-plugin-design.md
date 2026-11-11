# Plugin Photoshop « LM Signature » — description du projet

Date : 2026-11-11. Auteur de la demande : Luc Moreno (photographe). Les passages marqués **[mon choix]** sont des décisions prises à sa place, à relire.

## Pourquoi

Luc retouche ses photos dans Photoshop 26 (Windows) et les enregistre en JPEG. Aujourd'hui, pour signer, il doit sortir de Photoshop et passer par l'appli de lot « LM Watermark » (Electron + sharp, ce dépôt). Il veut signer **depuis Photoshop, à la fin de la retouche, juste avant d'enregistrer**, photo par photo, en un clic.

L'appli de lot reste utile et inchangée. Le plugin est un second outil pour un autre moment du travail.

## Ce que ça fait

Un panneau Photoshop avec un bouton **« Signer »**. Au clic :

1. Il lit l'image **telle qu'elle est vue** (tous les calques visibles combinés, pas un seul calque).
2. Il mesure la zone où la signature sera posée et choisit la signature **blanche ou noire** selon la lisibilité, avec la même logique que l'appli de lot (voir « Algorithme »).
3. Il pose la signature sur un **nouveau calque**, qu'il nomme « Signature LM ».
4. Le panneau indique quelle couleur a été choisie. Un bouton **« Inverser »** passe de blanc à noir (ou l'inverse) en un clic.

Luc enregistre ensuite son JPEG lui-même, comme d'habitude. Le plugin n'enregistre ni n'exporte rien.

### Réglages (valeurs par défaut décidées par Luc)
- Position : **en bas à droite** (les 7 positions de l'appli restent disponibles dans le panneau **[mon choix]**).
- Taille : **30 %** du plus petit côté de l'image (même définition que l'appli de lot, pour des résultats cohérents entre portrait et paysage). Cette taille s'applique à la **largeur complète du fichier PNG, marges transparentes comprises** : les PNG ont environ 73 % de leur largeur en texte visible (mesuré : contenu de x = 105 à 702 sur 820 px). Sur une photo de 3648 px de petit côté, la boîte fait donc 1 094 px et le texte visible environ 800 px, ce que montrent les exemples de Luc. La marge et la position se calculent aussi sur cette boîte, pas sur le texte visible. Respecter exactement ces règles, sinon la signature ne tombera pas là où Luc l'attend.
- Opacité : **100 %** (décidé par Luc).
- Marge : **30 px** (valeur par défaut de l'appli de lot) **[mon choix]**.
- Les réglages modifiés dans le panneau sont mémorisés entre les sessions **[mon choix]**.

### Signatures
Les deux PNG de Luc (`Signature_Blanc.png`, `Signature_noir.png`, 820 × 304 px, fond transparent, mêmes dimensions) sont **copiés dans le plugin** (`photoshop-plugin/assets/`), pour ne pas dépendre du disque `Y:` où ils sont aujourd'hui. Luc n'a pas de version plus grande : à 30 % sur une photo de 5472 px, la signature est agrandie d'environ 30 %. C'est accepté (voir « Risques »).

## Réussite et échec

**Réussi :** sur ses vraies photos, le plugin choisit la même couleur que l'appli de lot et la signature se lit bien. Cas de référence fournis par Luc : un portrait 3648 × 5472 et un paysage 5472 × 3648, tous deux sur fond sombre, signature blanche en bas à droite, environ 800 px de large visibles.

**Échec (la crainte de Luc) :** une signature qui ne se lit pas comme il faut. La justesse du choix de couleur et la possibilité de la corriger d'un clic comptent plus que tout le reste.

### Hors périmètre
- Pas de traitement par lot dans Photoshop (la fonction existe déjà dans l'appli).
- Pas d'enregistrement ni d'export par le plugin.
- Pas de publication sur le Marketplace Adobe, pas de compte, pas de réseau, pas de télémétrie.
- Pas de remplacement ni de modification de l'appli Electron existante.
- Pas de support de macOS ni d'anciennes versions de Photoshop (cible : Photoshop 26, Windows).

## Algorithme de choix de la couleur

Reprendre celui de [`processor.js`](../../../processor.js) (`scoreReadability`, `prepareWatermark`, `computePlacement`), à porter en JavaScript pur (sharp n'existe pas dans Photoshop) :
- zone = emplacement exact de la signature, pour chacune des deux variantes ;
- luminance sRGB linéaire, couleur réelle de chaque signature (moyenne pondérée par l'alpha) ;
- pour chaque pixel sous la signature : contraste WCAG entre le fond et le fond mélangé à la signature (selon l'opacité), pondéré par l'alpha, plafonné à 4,5 ;
- la variante avec le meilleur score gagne.

Ce code doit être un module pur, sans dépendance à Photoshop, testable avec Node. **Un test de parité** doit vérifier qu'il donne les mêmes choix que `processor.js` sur les mêmes images (par exemple les cas synthétiques déjà utilisés : fond sombre, clair, moyen, moitié sombre/moitié claire).

## Contraintes techniques (décidées)
- Plugin **UXP** (manifest v5, Photoshop 26), en JavaScript, dans un dossier `photoshop-plugin/` du même dépôt.
- Lecture des pixels via l'API d'imagerie de Photoshop, **uniquement sur la zone sous la signature** (pas toute l'image : les photos font 20 millions de pixels et plus).
- Le calque doit rester éditable : opacité réglée sur le calque, pas fusionnée dans les pixels.
- Interface en français.
- Installation personnelle : mode développement via UXP Developer Tool pendant la construction, puis un paquet `.ccx` installable d'un double-clic **[mon choix]**.
- Workflow du dépôt : branche + PR, et `@codex review` demandé à chaque PR et à chaque push de correction (préférence de Luc).

## Laissé au constructeur
Disposition du panneau, structure du code, noms internes, messages d'erreur (en français), icônes, format exact de mémorisation des réglages, et les cas limites sans impact sur le résultat attendu : aucun document ouvert (message clair, pas d'erreur brute), document avec une sélection active ou des calques verrouillés, annulation en un seul pas dans l'historique de Photoshop (« Signer » devrait être un seul état d'historique, annulable d'un Ctrl+Z).

## Mes choix à relire
1. **Signature posée comme objet dynamique** (smart object intégré) plutôt que pixels rasterisés : garde la qualité de la source et permet de redimensionner sans perte. À valider.
2. **Un second clic sur « Signer » remplace le calque « Signature LM » existant** au lieu d'en empiler un deuxième. Pour la mesure, la signature existante est ignorée (masquée ou retirée) afin qu'elle ne fausse pas l'analyse.
3. **Documents non RGB 8 bits** : comportement à définir par le constructeur. Proposition : fonctionner en RGB 8 et 16 bits, et afficher un message clair pour les autres modes (CMYK, niveaux de gris, 32 bits) plutôt qu'un résultat faux.
4. **Les 7 positions et les réglages dans le panneau**, alors que Luc signe toujours en bas à droite : un simple confort, sans coût important.

## Risques à lever en premier (petit essai avant tout le reste)
1. **Lire le composite visible d'une zone** dans Photoshop 26 via l'API d'imagerie (et non les pixels d'un seul calque). C'est la base du choix de couleur ; si ce n'est pas possible tel quel, la méthode de repli (par exemple dupliquer temporairement le document fusionné) change le plan.
2. **Poser un PNG du dossier du plugin** comme calque, à une taille et une position précises, depuis un plugin UXP (accès fichier, transformation).
3. **Gestion des couleurs** : la valeur lue et la valeur affichée doivent correspondre (profil du document), sinon le contraste calculé peut s'écarter de ce que Luc voit.
4. **Netteté de l'agrandissement** (signature de 820 px portée à environ 1 100 px) : à juger visuellement sur ses photos. Pas de version plus grande ni de vecteur disponibles.
