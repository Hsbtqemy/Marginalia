# Backlog executable - Marginalia

Ce backlog couvre le travail actif restant apres l'audit du 2026-04-01.
Il est volontairement oriente execution: ordre de passage, marquage des urgences, perimetre, definition of done, et verifications.

## Legende

- `[CRITIQUE]`: bloque la securite, la stabilite, ou le fait d'avoir un depot "vert". Aucun nouveau travail produit tant que ces items ne sont pas fermes.
- `[HAUT]`: gros levier apres stabilisation du socle.
- `[MOYEN]`: evolution produit/UX a traiter apres fermeture des points critiques.
- `Statut`: `todo`, `in progress`, `done`, `blocked`.

## Etat actuel

- OK: `npm test`
- OK: `cargo test --manifest-path src-tauri/Cargo.toml`
- OK: `npm run build`
- OK: `cargo check --manifest-path src-tauri/Cargo.toml`
- OK: `npm run lint:colors`
- OK: `npm run verify`
- OK: couverture automatisee etendue sur `queries`, invariants de linking, scheduler `New linked pair` et cleanup pointer global
- Incident connu: workflow `New linked pair` / `New linked note` encore fragile selon le scenario utilisateur.
- En cours: resize pointeur des panneaux reactive dans le code, verification manuelle Windows encore a faire.
- Dette visible: drag pointeur des blocs de marge toujours desactive, en attente d'un ticket dedie.

## Regles d'execution

- Tant qu'un item `[CRITIQUE]` est `todo` ou `in progress`, ne pas ouvrir de chantier produit non critique.
- Toute tache qui touche a Tauri, WebView2, resize, pointer capture ou drag doit inclure une verification manuelle Windows.
- Toute tache qui touche a la persistance, au linking, aux exports ou au bootstrap doit inclure des tests.
- Un item = une PR ou une petite stack de PR. Si un item touche plus de 4 a 5 fichiers majeurs, le splitter.
- A la fermeture d'un item: mettre a jour ce fichier, noter la verification faite, et lier la PR si disponible.

## Ordre d'execution recommande

1. `CRIT-01`
2. `CRIT-02`
3. `CRIT-03`
4. `QA-01`
5. `PERF-01`
6. `ARCH-01`
7. `EXP-01`
8. `UX-01`
9. `UX-02`
10. `UX-03`
11. `DX-01`

## Tableau actif

| ID | Marqueur | Priorite | Theme | Titre | Statut | Effort | Dependances |
|---|---|---|---|---|---|---|---|
| CRIT-01 | [CRITIQUE] | P0 | Securite / DX | Remplacer le fallback de boot dangereux et repasser le depot au vert | done | S | - |
| CRIT-02 | [CRITIQUE] | P0 | Stabilite | Corriger les gels d'interaction lies au pointer capture et reactiver le resize | in progress | M | - |
| CRIT-03 | [CRITIQUE] | P0 | UX / Stabilite | Stabiliser le workflow `New linked pair` entre manuscrit et marges | in progress | M | CRIT-02 |
| QA-01 | [HAUT] | P1 | Qualite | Poser une vraie chaine de verification locale + CI | in progress | M | CRIT-01, CRIT-03 |
| PERF-01 | [HAUT] | P1 | Performance | Supprimer les sync DOM O(n) sur les updates editeur | todo | L | QA-01 |
| ARCH-01 | [HAUT] | P1 | Architecture | Decouper les gros fichiers oriente orchestration | todo | M | QA-01 |
| EXP-01 | [MOYEN] | P2 | Produit | Aligner les attentes PDF/DOCX avec les comportements reels | todo | M | QA-01 |
| UX-01 | [MOYEN] | P2 | UX | Reduire le bruit permanent, simplifier la topbar et l'aide visible | in progress | M | - |
| UX-02 | [MOYEN] | P2 | UI | Recentrer l'interface sur le manuscrit | in progress | L | UX-01 |
| UX-03 | [MOYEN] | P2 | UI | Transformer les marges en vrai carnet de notes | in progress | L | UX-02 |
| UX-04 | [MOYEN] | P2 | UX | Decider et traiter le drag pointeur des blocs de marge | todo | M | CRIT-02 |
| DX-01 | [MOYEN] | P2 | DX | Ajouter une commande unique de verification et une doc contributeur simple | done | S | QA-01 |

## Items critiques

### CRIT-01 - Remplacer le fallback de boot dangereux et repasser le depot au vert

**Pourquoi**

- Le fallback de demarrage injecte une chaine HTML via `innerHTML`.
- Ce fallback contient des styles inline et des couleurs hardcodees.
- C'est a la fois un sujet de securite de base et la cause directe du `lint:colors` rouge.

**Perimetre**

- `src/main.tsx`
- `src/theme/tokens.css`
- eventuellement un composant/fichier de fallback dedie si besoin

**Travaux**

1. Remplacer le rendu par string HTML par un rendu DOM sur ou par un composant React de fallback.
2. Rendre le message d'erreur comme texte, jamais comme HTML interprete.
3. Supprimer les styles inline et passer par les tokens / classes CSS.
4. Verifier qu'aucune nouvelle exception de boot ne casse le fallback lui-meme.
5. Repasser `npm run lint:colors` au vert.

**Definition of done**

- `src/main.tsx` n'utilise plus `innerHTML` pour afficher les erreurs de demarrage.
- Aucune couleur inline ou litterale hors `src/theme/tokens.css`.
- Le message d'erreur reste lisible et ne peut pas injecter de markup.
- Le depot est vert sur `lint:colors`, `test`, `build`.

**Verification**

- `npm run lint:colors`
- `npm test`
- `npm run build`
- verifier manuellement un plantage de boot simule et lire le fallback affiche

**Sortie attendue**

- PR courte, autonome, mergeable seule.

**Statut**

- done le 2026-04-01
- verification executee:
  - `npm run lint:colors`
  - `npm test`
  - `npm run build`

---

### CRIT-02 - Corriger les gels d'interaction lies au pointer capture et reactiver le resize

**Pourquoi**

- Le resize pointeur des panneaux est desactive.
- Le drag pointeur des blocs de marge est desactive.
- Le code indique explicitement qu'il existe des gels d'input sur certaines configurations Windows/WebView.

**Perimetre**

- `src/app/layout/ThreePaneLayout.tsx`
- `src/editors/margin/MarginEditorBase.tsx`
- `src/app/App.tsx` si la logique globale de release doit etre renforcee

**Travaux**

1. Ecrire une matrice de reproduction Windows: resize gauche, resize droite, alt-tab, blur de fenetre, escape, drag rapide.
2. Isoler le ou les scenarios qui laissent un curseur bloque ou des clics inertes.
3. Corriger la logique de cleanup `pointerup` / `pointercancel` / `lostpointercapture` / `blur`.
4. Reactiver `ENABLE_POINTER_RESIZE`.
5. Soit reactiver le drag pointeur des blocs avec garanties, soit supprimer le chemin mort et ouvrir un item separe.

**Definition of done**

- Plus aucun etat "clics bloques" apres resize.
- Le curseur revient toujours a l'etat normal.
- Le resize pointeur est reactive et stable.
- Le code ne contient plus de feature critique desactivee sans plan clair.

**Verification**

- verification manuelle Windows obligatoire
- scenario 1: resize gauche puis relacher hors fenetre
- scenario 2: resize droite puis alt-tab
- scenario 3: resize, escape, blur, retour fenetre
- scenario 4: changer de document apres resize
- `npm test`
- `npm run build`

**Sortie attendue**

- PR de stabilite uniquement, sans retouche visuelle annexe.

**Statut**

- in progress le 2026-04-01
- fait:
  - cleanup de resize renforce
  - resize pointeur reactive
  - garde-fou global de release aligne sur les captures actives
  - helper `releaseStuckPointerState` extrait et teste en `jsdom`
- reste a faire:
  - verification manuelle Windows
  - statuer explicitement sur le drag pointeur des blocs de marge

---

### CRIT-03 - Stabiliser le workflow `New linked pair`

**Pourquoi**

- C'est un parcours coeur produit.
- Il existe un incident connu autour de `New linked note` / `New linked pair`.
- Le flux actuel depend d'un enchainement de focus + `setTimeout`, donc potentiellement race-prone.

**Perimetre**

- `src/app/App.tsx`
- `src/editors/manuscript/ManuscriptEditor.tsx`
- `src/editors/margin/MarginEditorBase.tsx`
- `src/editors/manuscript/lexicalBlocks/*`
- tests TypeScript cibles

**Travaux**

1. Documenter les scenarios de repro:
   - depuis une selection manuscrit existante
   - sans block cible courant
   - apres changement de document
   - avec panneau droit masque
   - via toolbar, via palette, via raccourci clavier
2. Remplacer si possible l'orchestration basee sur `setTimeout` par une sequence plus deterministe.
3. Verifier qu'un block manuscrit est toujours cree ou reuse une seule fois.
4. Verifier qu'une note liee est toujours creee au bon endroit, avec bon focus, sans doublon ni freeze.
5. Ajouter une couverture de test sur les utilitaires de block id et les invariants de linking.

**Definition of done**

- Le parcours `New linked pair` ne gele plus l'interface.
- Pas de doublon de passage ou de note.
- Le focus final est previsible.
- Les invariants de linking critiques sont testes.

**Verification**

- verification manuelle Windows
- verification manuelle macOS/Linux si disponibles
- `npm test`
- `npm run build`

**Sortie attendue**

- PR centree sur le flux lie, sans redesign de toolbar.

**Statut**

- in progress le 2026-04-01
- fait:
  - creation liee serialisee via un timer unique
  - annulation des creations en attente au changement de document et a l'unmount
  - garde-fou sur l'ID de document courant avant execution
  - orchestration extraite dans un scheduler dedie et testable
  - tests ajoutes sur remplacement de requete en attente, changement de document et remontée d'erreur
- reste a faire:
  - verification manuelle des scenarios de repro
  - confirmer qu'il n'y a plus de doublon ni de freeze sur parcours reel

## Stabilisation du socle

### QA-01 - Poser une vraie chaine de verification locale + CI

**Pourquoi**

- Le depot a deja des tests utiles, mais pas encore de chaine unifiee ni de CI visible.
- Les zones les plus sensibles ne sont pas encore assez couvertes.

**Perimetre**

- `package.json`
- `.github/workflows/*` si GitHub est la forge cible
- `scripts/*`
- tests TypeScript dans `src/**`
- tests Rust dans `src-tauri/src/lib.rs` ou modules extraits

**Travaux**

1. Ajouter une commande unique, par exemple `npm run verify`, qui lance au minimum:
   - `npm run lint:colors`
   - `npm test`
   - `npm run build`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `cargo check --manifest-path src-tauri/Cargo.toml`
2. Ajouter une CI qui execute la meme chaine.
3. Etendre les tests sur:
   - `src/db/queries.ts`
   - invariants de linking
   - fallback de boot si extrait
   - regression de sanitization / print preview
4. Documenter la verification locale dans le README.

**Definition of done**

- Une seule commande locale permet de verifier le projet.
- Une CI echoue si lint/tests/build/check cassent.
- Les flux critiques ont une couverture initiale suffisante.

**Verification**

- lancer la commande unique locale
- verifier un run CI vert sur une branche de test

**Statut**

- in progress le 2026-04-01
- fait:
  - `npm run verify` ajoute
  - workflow GitHub Actions `verify.yml` ajoute
  - README aligne sur la nouvelle chaine de verification
  - tests ajoutes sur `src/db/queries.ts`
  - tests ajoutes sur les invariants de linking critiques
  - tests ajoutes sur le scheduler `New linked pair`
  - tests ajoutes sur le cleanup pointer global
- reste a faire:
  - verifier un run CI vert sur GitHub Actions

---

### PERF-01 - Supprimer les sync DOM O(n) sur les updates editeur

**Pourquoi**

- Plusieurs plugins balayent tout ou partie du DOM a chaque update.
- Sur gros documents, ce sera un plafond de performance avant meme les nouvelles features.

**Perimetre**

- `src/editors/manuscript/lexicalBlocks/BlockIdPlugin.tsx`
- `src/editors/manuscript/ManuscriptEditor.tsx`
- `src/editors/margin/MarginEditorBase.tsx`
- eventuels helpers de sync DOM / indexes

**Travaux**

1. Profiler les updates sur un document long de reference.
2. Identifier les sync full-scan a remplacer:
   - rebinding des `data-manuscript-block-id`
   - sync preview des notes liees
   - sync des compteurs / etats de blocks
3. Passer a une strategie incrementale ou event-driven.
4. Ajouter au moins un scenario de non-regression "gros document".

**Definition of done**

- Plus de scan global systematique a chaque frappe sur les chemins critiques.
- Pas de lag visible sur un document de reference long.
- Les attributs DOM utiles restent coherents.

**Verification**

- `npm test`
- `npm run build`
- scenario manuel avec document long

---

### ARCH-01 - Decouper les gros fichiers d'orchestration

**Pourquoi**

- `App.tsx`, `MarginEditorBase.tsx` et `src-tauri/src/lib.rs` concentrent trop de responsabilites.
- Cela ralentit les modifs et augmente le risque de regression.

**Perimetre**

- `src/app/App.tsx`
- `src/editors/margin/MarginEditorBase.tsx`
- `src-tauri/src/lib.rs`

**Travaux**

1. Extraire du frontend:
   - bootstrap / load document
   - export / print preview
   - menus / palette / dialogs
2. Extraire de l'editeur de marge:
   - toolbar
   - bridge plugin
   - drag / pointer logic
3. Extraire du Rust:
   - parsing Lexical
   - construction DOCX
   - commandes Tauri

**Definition of done**

- Les responsabilites sont separees.
- Les fichiers critiques deviennent lisibles et localisables.
- Les tests restent verts apres extraction.

**Verification**

- `npm test`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

## Produit et UX

### EXP-01 - Aligner les attentes PDF/DOCX avec les comportements reels

**Pourquoi**

- Le PDF/print preview et le DOCX n'offrent pas la meme profondeur fonctionnelle.
- Il faut soit aligner l'UI et la doc, soit preparer une vraie parite.

**Perimetre**

- `README.md`
- labels UI dans `src/app/App.tsx` et menus
- backlog export si une phase 2 est ouverte

**Travaux**

1. Ecrire une matrice de comportement:
   - manuscrit
   - notes gauche liees
   - notes droite liees
   - notes non liees
   - styles inline
2. Clarifier dans l'UI ce que fait reellement `Page Preview`.
3. Clarifier ce que fait le profil DOCX `clean` vs `working`.
4. Ouvrir ensuite, si necessaire, une phase 2 export avec vrais deltas fonctionnels.

**Definition of done**

- Un utilisateur comprend sans surprise ce que sort chaque export.
- L'UI et la doc racontent la meme chose.

**Verification**

- relire README + menus + boutons
- export manuel d'un document de reference

---

### UX-01 - Reduire le bruit permanent, simplifier la topbar et l'aide visible

**Pourquoi**

- L'interface reste chargee en chips, aide clavier et actions de meme niveau.
- Le haut de page et les toolbars prennent trop de poids par rapport au texte.

**Perimetre**

- `src/app/App.tsx`
- `src/app/CommandPalette.tsx`
- `src/editors/manuscript/ManuscriptEditor.tsx`
- `src/editors/margin/MarginEditorBase.tsx`
- styles associes

**Travaux**

1. Limiter les informations toujours visibles a ce qui aide immediatement l'ecriture.
2. Replier les raccourcis dans une aide contextuelle ou dans la palette.
3. Simplifier la topbar: document, export, vue, actions rapides.
4. Reduire la masse visuelle des toolbars.

**Definition of done**

- L'ecran par defaut contient moins de bruit UI.
- Le texte et les notes reprennent la priorite visuelle.
- Les raccourcis restent decouvrables.

---

### UX-02 - Recentrer l'interface sur le manuscrit

**Pourquoi**

- Le centre doit devenir la vraie colonne editoriale du produit.

**Perimetre**

- layout central
- densite, largeur, rythme, hierarchie typo

**Travaux**

1. Donner au manuscrit une largeur stable et editoriale.
2. Faire passer les outils au second plan.
3. Valider l'ecran vide et l'ecran long.

**Definition of done**

- Le manuscrit domine clairement l'ecran.
- L'app ressemble d'abord a un outil d'ecriture, pas a un panneau d'admin.

---

### UX-03 - Transformer les marges en vrai carnet de notes

**Pourquoi**

- Les marges doivent valoriser les notes avant les commandes.

**Perimetre**

- `src/editors/margin/*`
- styles et hierarchie visuelle des blocs

**Travaux**

1. Faire des blocs de notes l'unite principale visible.
2. Passer les actions secondaires hors de la vue primaire si possible.
3. Mieux mettre en scene l'etat lie / non lie et l'extrait de passage.

**Definition of done**

- La marge evoque un carnet de notes, pas une grosse toolbar.
- Les notes sont plus lisibles que les controles.

---

### UX-04 - Decider et traiter le drag pointeur des blocs de marge

**Pourquoi**

- Le reordonnancement clavier existe, mais le drag pointeur de blocs est encore desactive.
- Il faut decider clairement si cette interaction fait partie du produit stable ou non.

**Perimetre**

- `src/editors/margin/MarginEditorBase.tsx`
- tests et documentation UX si le drag est retenu

**Travaux**

1. Decider si le drag pointeur doit faire partie du parcours standard.
2. Si oui, le stabiliser et le tester manuellement sur Windows.
3. Si non, retirer le chemin mort et assumer le reordonnancement clavier / commandes.

**Definition of done**

- Le produit a une position claire sur le reorder pointeur.
- Le code ne garde plus de feature dormante sans statut explicite.

## DX

### DX-01 - Ajouter une commande unique de verification et une doc contributeur simple

**Pourquoi**

- Le projet est deja verifiable localement, mais pas encore via une entree unique.

**Perimetre**

- `package.json`
- `README.md`
- eventuellement `scripts/verify.*`

**Travaux**

1. Ajouter `npm run verify`.
2. Documenter prerequis exacts `node`, `npm`, `cargo`.
3. Documenter le cas Windows si `PATH` n'est pas correctement initialise.

**Definition of done**

- Un nouveau contributeur sait lancer le projet et la verification sans ambiguite.

**Statut**

- done le 2026-04-01
- fait:
  - `npm run verify` ajoute dans `package.json`
  - README mis a jour avec prerequis et note `PATH` Windows

## Archive - deja traite ou clos

Ces items ne sont pas prioritaires a rouvrir sauf regression constatee.

- `SEC-01` - hardening print preview / CSP: done
- `PERF-legacy-01` - debounce de la persistance UI: done
- `REL-01` - gestion d'erreur utilisateur bootstrap/save/export: done
- `DATA-01` - creation de document transactionnelle: done
- `SEC-02` - permissions Tauri reduites: done
- `DATA-02` - fiabilisation migrations: done
- `EXP-doc-01` - limites DOCX documentees: done
- `UX-legacy-01` - dialogues natifs app au lieu de `prompt/confirm`: done
- `DX-legacy-01` - details de finition de base: done

## Lots recommandes

### Lot 1 - Fermer les urgences

- `CRIT-01`
- `CRIT-02`
- `CRIT-03`

**But**

- remettre le depot propre et stabiliser le coeur de l'interaction

### Lot 2 - Poser le filet de securite

- `QA-01`
- `DX-01`

**But**

- rendre chaque futur chantier verifiable et audit-able

### Lot 3 - Enlever les plafonds techniques

- `PERF-01`
- `ARCH-01`

**But**

- reduire le risque de regression et preparer la suite

### Lot 4 - Reprendre la promesse produit

- `EXP-01`
- `UX-01`
- `UX-02`
- `UX-03`

**But**

- faire converger comportement reel, UI et experience d'ecriture

## Checklist de fermeture d'item

- [ ] le code est mergeable en l'etat
- [ ] les verifications prevues ont ete lancees
- [ ] la verification manuelle Windows est notee si necessaire
- [ ] ce fichier est mis a jour
- [ ] la PR ou le commit de reference est mentionne
