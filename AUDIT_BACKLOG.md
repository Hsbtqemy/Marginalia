# Backlog executable - Marginalia

Ce backlog traduit l'audit en travaux concrets, priorises, avec definition of done, livrables, risques et dependances.

## Regles d'execution

- Chaque item doit produire une PR ou un lot de commits autonome.
- Ne pas melanger hardening, UX et gros refactors dans une meme PR.
- Toute tache qui touche a l'export ou a la persistance doit inclure des tests.
- Toute tache qui touche a Tauri doit inclure une verification manuelle Windows au minimum.
- Tant que l'item `SEC-01` n'est pas traite, eviter d'etendre les usages HTML/libres dans l'app.

## Vue d'ensemble

| ID | Priorite | Theme | Titre | Effort | Risque |
|---|---|---|---|---|---|
| SEC-01 | P0 | Securite | Durcir l'aperçu d'impression et la CSP Tauri | M | Eleve |
| PERF-01 | P0 | Performance | Debouncer la persistance des preferences UI | S | Moyen |
| REL-01 | P0 | Robustesse | Ajouter une gestion d'erreur utilisateur sur bootstrap/save/export | M | Eleve |
| DATA-01 | P1 | Donnees | Rendre `createDocument` transactionnel | S | Moyen |
| SEC-02 | P1 | Securite | Reduire les permissions Tauri au strict necessaire | S | Moyen |
| DATA-02 | P1 | Donnees | Fiabiliser le systeme de migrations | M | Moyen |
| QA-01 | P1 | Qualite | Poser un socle de tests automatise | M | Eleve |
| EXP-01 | P1 | Produit | Documenter explicitement les limites de l'export DOCX | S | Faible |
| EXP-02 | P2 | Export | Augmenter la fidelite de l'export DOCX | L | Moyen |
| UX-01 | P2 | UX | Remplacer `prompt/confirm` par des modales natives de l'app | M | Faible |
| UX-02 | P1 | UX/UI | Recentrer l'app sur l'ecriture | L | Eleve |
| UX-03 | P1 | UX/UI | Redessiner la marge comme un carnet de notes | L | Eleve |
| UX-04 | P1 | UX/UI | Reduire le bruit permanent et rendre l'aide contextuelle | M | Moyen |
| UX-05 | P2 | UX/UI | Installer une direction visuelle editoriale complete | L | Moyen |
| UX-06 | P2 | UX/UI | Recomposer la topbar et la navigation document | M | Moyen |
| DX-01 | P2 | DX | Corriger les details de finition du projet | S | Faible |

## Etat d'avancement (2026-04-01)

| ID | Statut |
|---|---|
| SEC-01 | done |
| PERF-01 | done |
| REL-01 | done |
| DATA-01 | done |
| SEC-02 | done |
| DATA-02 | done |
| QA-01 | in progress |
| EXP-01 | done |
| EXP-02 | todo |
| UX-01 | done |
| UX-02 | in progress |
| UX-03 | in progress |
| UX-04 | in progress |
| UX-05 | in progress |
| UX-06 | in progress |
| DX-01 | done |

### Resume

- done: 8
- in progress: 6
- todo: 1
- hors backlog initial (critique): stabilite UX autour de `New linked note` (plantage/interactions gelees selon scenario utilisateur)

### Reste a faire priorise

1. `QA-01`: finaliser le socle de tests (renforcer surtout la couverture DB/queries et scenarios UI critiques).
2. `UX-02`, `UX-03`, `UX-04`, `UX-06`: terminer la passe writer-first (hierarchie manuscrit, marge carnet, densite d'aides, topbar).
3. `UX-05`: finaliser la signature visuelle editoriale (coherence globale + captures avant/apres).
4. `EXP-02`: phase export DOCX fidelity apres stabilisation UX/QA.

---

## P0 - A traiter d'abord

### SEC-01 - Durcir l'aperçu d'impression et la CSP Tauri

**Pourquoi**

- L'app injecte du HTML dans `iframe.srcDoc`.
- La CSP Tauri est desactivee.
- C'est la zone la plus sensible du projet.

**Objectif**

- Empêcher toute execution de script non desiree dans l'aperçu.
- Garder l'aperçu imprimeable sans ouvrir une breche inutile.

**Travaux**

1. Recenser exactement ce que `manuscriptHtml` peut contenir apres sortie Lexical.
2. Introduire une sanitization explicite avant injection dans l'aperçu.
3. Restreindre l'HTML de preview a une liste de tags/attributs autorises.
4. Retablir une CSP Tauri stricte et tester l'aperçu avec cette CSP.
5. Verifier que l'impression PDF continue de fonctionner sur Windows.

**Definition of done**

- `src-tauri/tauri.conf.json` n'utilise plus `csp: null`.
- L'aperçu d'impression n'accepte plus d'HTML arbitraire non filtre.
- Un test couvre au moins un cas de contenu dangereux neutralise.
- Une note dans le README explique l'approche retenue.

**Livrables**

- Hardening preview.
- CSP active.
- Test(s) et doc.

**Dependances**

- Aucune.

---

### PERF-01 - Debouncer la persistance des preferences UI

**Pourquoi**

- Les tailles de panneaux sont sauvees a chaque mouvement de pointeur.
- Cela peut multiplier les ecritures disque et degrader la fluidite.

**Objectif**

- Persister l'etat UI sans ecriture aggressive.

**Travaux**

1. Differencier mise a jour en memoire et persistance disque.
2. Sauver `paneSizes` a la fin du drag, ou avec un debounce raisonnable.
3. Verifier si `themeMode`, `highContrast`, `pagePreview`, `rightPaneVisible` doivent rester en sauvegarde immediate.
4. Ajouter un garde-fou pour eviter les `save()` concurrents/redundants.

**Definition of done**

- Le resize reste fluide.
- Les preferences sont bien restaurees au redemarrage.
- Les ecritures de preferences sont reduites de maniere evidente.

**Livrables**

- Refactor de la persistance UI.
- Test manuel documente.

**Dependances**

- Aucune.

---

### REL-01 - Ajouter une gestion d'erreur utilisateur sur bootstrap/save/export

**Pourquoi**

- Les erreurs critiques remontent surtout en crash ou en rejection non geree.
- L'utilisateur n'a pas de voie claire pour comprendre ou recuperer.

**Objectif**

- Remplacer l'echec brutal par une UX de recuperation ou, au minimum, un message clair.

**Travaux**

1. Entourer le bootstrap DB/store d'un `try/catch` avec etat d'erreur visible.
2. Gerer les echecs de sauvegarde manuscrit/marges/presets.
3. Gerer les echecs de `pick_save_path` et `export_docx` avec feedback utilisateur.
4. Definir un composant simple de message d'erreur ou banniere d'etat.
5. Journaliser les erreurs de maniere exploitable.

**Definition of done**

- Un echec DB au demarrage affiche un etat comprehensible.
- Un echec d'export n'entraine pas un silence ou un crash.
- Les erreurs importantes sont logguees.

**Livrables**

- Etats d'erreur UI.
- Logging minimum.
- Scenarios manuels de verification.

**Dependances**

- Aucune.

---

## P1 - Stabilisation

### DATA-01 - Rendre `createDocument` transactionnel

**Pourquoi**

- La creation de document effectue plusieurs operations separees.
- Un echec intermediaire peut laisser la base dans un etat partiel.

**Objectif**

- Garantir l'atomicite de la creation d'un document.

**Travaux**

1. Mettre `documents`, `manuscript_states`, `margin_left_states`, `margin_right_states`, `document_export_settings` dans une meme transaction.
2. Definir clairement ce qui se passe si les presets builtin n'existent pas encore.
3. Ajouter un test de non-regression.

**Definition of done**

- Soit le document est entierement cree, soit rien n'est persiste.
- Un test couvre l'invariant transactionnel.

**Dependances**

- Peut etre traite avant ou apres `DATA-02`.

---

### SEC-02 - Reduire les permissions Tauri au strict necessaire

**Pourquoi**

- Les permissions `fs` et clipboard paraissent plus larges que l'usage visible.
- Le principe du moindre privilege n'est pas respecte.

**Objectif**

- Conserver uniquement les permissions justifiees par le produit.

**Travaux**

1. Inventorier les plugins reellement utilises cote frontend et Rust.
2. Retirer les permissions non utilisees.
3. Remplacer les permissions globales par des permissions plus specifiques si possible.
4. Verifier qu'export, store, SQL et impression fonctionnent encore.

**Definition of done**

- Chaque permission restante est justifiee.
- Aucune fonctionnalite existante n'est regressionnee.

**Dependances**

- Aucune, mais a recouper avec `SEC-01`.

---

### DATA-02 - Fiabiliser le systeme de migrations

**Pourquoi**

- Le decoupage SQL par `;` ne passera pas a l'echelle.

**Objectif**

- Eviter qu'une future migration casse pour une raison purement technique.

**Travaux**

1. Choisir une strategie:
   - executeur capable de prendre un script SQL complet;
   - format de migration plus simple;
   - ou migrations codees si le plugin l'impose.
2. Documenter les contraintes de format.
3. Ajouter un test sur au moins une migration representative.

**Definition of done**

- Le moteur de migration ne depend plus d'un split naif sur `;`, ou cette contrainte est explicitement verrouillee et testee.

**Dependances**

- Aucune.

---

### QA-01 - Poser un socle de tests automatise

**Pourquoi**

- Aujourd'hui, aucun filet de securite reel.

**Objectif**

- Couvrir d'abord les zones a fort risque et forte valeur.

**Travaux**

1. Definir la pile de tests TypeScript.
2. Ajouter des tests sur:
   - `src/db/queries.ts`
   - `src/db/db.ts`
   - `src/editors/margin/marginaliaBlocks/indexing.ts`
   - `src/utils/printPreview.ts`
3. Ajouter des tests Rust sur le parsing/export:
   - `parse_manuscript_blocks`
   - `parse_margin_blocks`
   - regroupement comments/footnotes
4. Ajouter un script de CI local simple dans `package.json` et/ou documentation.

**Definition of done**

- Une commande de tests existe.
- Les zones critiques ont une couverture initiale.
- Les tests sont assez rapides pour etre lances avant merge.

**Dependances**

- Facilite tous les autres items.

---

### EXP-01 - Documenter explicitement les limites de l'export DOCX

**Pourquoi**

- L'export actuel est utile, mais pas fidele a tout ce que l'editeur permet.

**Objectif**

- Aligner les attentes utilisateur avec le comportement reel.

**Travaux**

1. Ajouter dans le README ce qui est preserve par l'export.
2. Ajouter ce qui n'est pas encore preserve.
3. Expliquer la difference entre profil `Clean` et `Working`.

**Definition of done**

- Le README permet a un utilisateur de savoir a quoi s'attendre avant export.

**Dependances**

- Aucune.

---

## P2 - Evolution produit et finition

### EXP-02 - Augmenter la fidelite de l'export DOCX

**Pourquoi**

- Le produit gagnera en valeur si le DOCX ressemble davantage au manuscrit.

**Objectif**

- Ameliorer la restitution semantique et visuelle sans casser la robustesse.

**Pistes**

1. Support des styles inline essentiels.
2. Meilleure gestion des listes.
3. Gestion des liens si pertinents.
4. Preservation plus fine des retours ligne et blocs vides.
5. Strategie plus propre pour commentaires multiples et notes de bas de page.

**Definition of done**

- Une matrice "editeur -> DOCX" existe.
- Les comportements supportes sont testes.

**Dependances**

- Idealement apres `QA-01`.

---

### UX-01 - Remplacer `prompt/confirm` par des modales natives de l'app

**Pourquoi**

- Les dialogues navigateur cassent l'homogeneite UX.

**Objectif**

- Offrir une UX coherente avec le reste du produit.

**Travaux**

1. Creer une modale de renommage.
2. Creer une modale de confirmation de suppression.
3. Ajouter gestion clavier, focus, fermeture et etat d'erreur.

**Definition of done**

- Plus aucun `window.prompt` ni `window.confirm`.
- Le focus est maitrise et accessible.

**Dependances**

- Peut reutiliser le pattern du `PresetManager`.

---

### UX-02 - Recentrer l'app sur l'ecriture

**Pourquoi**

- Le manuscrit n'est pas encore la zone dominante de l'interface.
- L'app ressemble davantage a un outil de debug/edition qu'a un environnement d'ecriture.

**Objectif**

- Faire du texte l'element visuel principal, avec une vraie colonne d'ecriture et une hierarchie claire.

**Travaux**

1. Redefinir la hierarchie des surfaces: manuscrit premier plan, outils second plan, aides troisieme plan.
2. Donner au centre une vraie largeur editoriale stable, meme hors mode page preview.
3. Revoir les espacements, marges et hauteurs de lignes pour obtenir un rythme de lecture/ecriture plus calme.
4. Diminuer le contraste et la masse visuelle des toolbars par rapport au texte.
5. Verifier que la vue par defaut est accueillante sur document vide comme sur document long.

**Definition of done**

- Au premier regard, le manuscrit domine clairement l'ecran.
- Le centre ne ressemble plus a un panneau d'outil sombre.
- La zone de texte garde une largeur et une respiration coherentes en desktop.

**Livrables**

- Refonte des surfaces du centre.
- Ajustements CSS de hierarchie et de rythme.
- Validation visuelle sur ecran vide et ecran rempli.

**Dependances**

- A traiter avant `UX-05`.

---

### UX-03 - Redessiner la marge comme un carnet de notes

**Pourquoi**

- La marge gauche fonctionne, mais son langage visuel actuel est celui d'une toolbar geante.
- Elle ne valorise pas assez les notes elles-memes ni leur relation avec le manuscrit.

**Objectif**

- Faire de la marge un espace de pensee lisible, agreable et oriente contenu.

**Travaux**

1. Passer d'une grille d'actions permanente a une presentation d'abord centree sur les blocs de notes.
2. Grouper les actions par niveau: creation, liaison, structure, danger.
3. Rendre les metadonnees de note plus discretes et plus editoriales.
4. Mieux mettre en scene l'extrait du passage lie et l'etat de liaison.
5. Introduire des actions secondaires en hover, menu contextuel ou palette si necessaire.

**Definition of done**

- La marge ressemble a un carnet annexe, pas a un panneau de commandes.
- Les notes sont plus lisibles que les boutons.
- Les actions critiques restent accessibles sans saturer la vue.

**Livrables**

- Recomposition de la marge.
- Etats de note plus lisibles.
- Strategie d'actions secondaires documentee.

**Dependances**

- Idealement apres `UX-02`.

---

### UX-04 - Reduire le bruit permanent et rendre l'aide contextuelle

**Pourquoi**

- Les chips d'etat, aides clavier et messages permanents prennent trop de place.
- Une vraie app d'ecriture cache la complexite tant qu'elle n'est pas utile.

**Objectif**

- Garder l'aide disponible sans la laisser concurrencer le contenu.

**Travaux**

1. Identifier tout ce qui peut passer de "toujours visible" a "sur demande" ou "selon le focus".
2. Replier les raccourcis dans une aide contextuelle, un tiroir, un popover ou la palette.
3. Simplifier les bandeaux de statut manuscrit/marges a 1 ou 2 informations prioritaires.
4. Reduire la densite des chips et harmoniser leur usage.
5. Verifier que les raccourcis restent decouvrables pour un nouvel utilisateur.

**Definition of done**

- L'ecran par defaut contient nettement moins de micro-elements.
- Les aides clavier ne saturent plus la zone de travail.
- Les statuts restants ont une utilite immediate.

**Livrables**

- Inventaire des aides permanentes.
- Refonte des statuts et aides contextuelles.
- Verification avec document vide et document annote.

**Dependances**

- Se traite en parallele de `UX-02` et `UX-03`.

---

### UX-05 - Installer une direction visuelle editoriale complete

**Pourquoi**

- L'app est encore dans une esthetique "dark utility" generique.
- Elle a besoin d'une identite visuelle qui soutienne son concept de manuscrit annote.

**Objectif**

- Poser une direction visuelle nette: atelier d'auteur, bureau editorial, ou carnet critique.

**Travaux**

1. Choisir un axe visuel explicite et en deduire tokens, contrastes, surfaces et typographies.
2. Revoir la palette, les bordures, les elevations et les separations.
3. Renforcer la hierarchie typographique entre titre de document, texte, notes et UI secondaire.
4. Soigner les etats vides, la vue document rempli, et le mode page preview.
5. Verifier coherence desktop, contraste et accessibilite.

**Definition of done**

- Le produit a une signature visuelle identifiable.
- Les surfaces et typographies servent l'ecriture au lieu de rappeler un panneau d'admin.
- La coherence est visible entre topbar, manuscrit, marges et modales.

**Livrables**

- Direction visuelle formalisee.
- Mise a jour des tokens et composants principaux.
- Captures avant/apres.

**Dependances**

- A mener apres `UX-02`.

---

### UX-06 - Recomposer la topbar et la navigation document

**Pourquoi**

- La topbar prend beaucoup de place et presente trop d'actions de meme niveau.
- Le document et son contexte ne sont pas assez valorises.

**Objectif**

- Faire de la topbar un cadre discret et efficace pour naviguer, non une barre de controle dominante.

**Travaux**

1. Rehierarchiser les actions topbar: document, export, vue, quick actions.
2. Simplifier la presentation du select document et du preset actif.
3. Clarifier ce qui doit vivre dans le menu natif, la topbar ou la palette.
4. Revoir les tailles de boutons, espacements et alignements.
5. Verifier la lisibilite sur petites largeurs desktop.

**Definition of done**

- La topbar parait plus legere.
- Les actions frequentes sont evidentes sans surcharger le haut de page.
- Le nom du document et son contexte gagnent en importance.

**Livrables**

- Nouvelle hierarchie topbar.
- Rationalisation des actions visibles.
- Verification responsive desktop.

**Dependances**

- Peut demarrer en parallele de `UX-02`.

---

### DX-01 - Corriger les details de finition du projet

**Pourquoi**

- Quelques details donnent une impression de template ou d'etat intermediaire.

**Travaux**

1. Remplacer le titre HTML par le vrai nom du produit.
2. Verifier les libelles visibles et la coherence typographique.
3. Ajouter une section README "verifications locales" avec commandes attendues.
4. Verifier que les prerequis `node`, `npm`, `cargo` sont clairement decrits.

**Definition of done**

- Le depot ne contient plus de trace evidente du template initial.

**Dependances**

- Aucune.

---

## Sprint recommande

### Sprint 1

- `SEC-01`
- `PERF-01`
- `REL-01`

**But**

- Fermer les plus gros risques sans changer le scope produit.

### Sprint 2

- `DATA-01`
- `SEC-02`
- `QA-01`
- `EXP-01`

**But**

- Rendre le socle fiable et auditable.

### Sprint 3

- `DATA-02`
- `UX-01`
- `DX-01`

**But**

- Ameliorer la qualite de vie du projet et preparer les evolutions.

### Sprint 4+

- `EXP-02`

**But**

- Monter en valeur produit sur l'export sans sacrifier la stabilite.

### Sprint 5

- `UX-02`
- `UX-04`
- `UX-06`

**But**

- Recentrer l'application sur l'ecriture et faire disparaitre le bruit de prototype.

### Sprint 6

- `UX-03`
- `UX-05`

**But**

- Donner a Marginalia une vraie presence d'app d'ecriture, coherente avec sa promesse editoriale.

---

## Tickets prets a ouvrir

### Ticket 1

**Titre**

- Hardening de l'aperçu d'impression et reactivation de la CSP

**Checklist**

- [ ] Sanitizer HTML defini
- [ ] Injection `srcDoc` securisee
- [ ] CSP Tauri active
- [ ] Test de contenu hostile
- [ ] Verification manuelle impression Windows

### Ticket 2

**Titre**

- Debounce de la persistance des preferences UI

**Checklist**

- [ ] `paneSizes` persiste seulement en fin d'interaction ou debounce
- [ ] Pas de lag perceptible au resize
- [ ] Restore OK au redemarrage

### Ticket 3

**Titre**

- Gestion d'erreur utilisateur sur bootstrap et export

**Checklist**

- [ ] Ecran/etat d'erreur demarrage
- [ ] Feedback erreur export
- [ ] Logs minimum

### Ticket 4

**Titre**

- Transactions sur la creation de document

**Checklist**

- [ ] Creation atomique
- [ ] Test de non-regression

### Ticket 5

**Titre**

- Reduction des permissions Tauri

**Checklist**

- [ ] Inventaire usages plugins
- [ ] Permissions inutiles retirees
- [ ] Smoke test fonctionnel

### Ticket 6

**Titre**

- Mise en place du socle de tests TS/Rust

**Checklist**

- [ ] Strategie test TS choisie
- [ ] Tests DB minimum
- [ ] Tests export Rust minimum
- [ ] Commande documentee

### Ticket 7

**Titre**

- Recentrer Marginalia sur le manuscrit

**Checklist**

- [ ] Colonne de manuscrit plus editoriale
- [ ] Hierarchie visuelle recentree sur le texte
- [ ] Toolbars declasses visuellement
- [ ] Validation ecran vide / ecran rempli

### Ticket 8

**Titre**

- Transformer la marge en carnet de notes

**Checklist**

- [ ] Actions moins dominantes
- [ ] Blocs de notes plus lisibles
- [ ] Etats de liaison mieux mis en scene
- [ ] Actions secondaires deplacees hors de la vue primaire

### Ticket 9

**Titre**

- Nettoyer les aides permanentes et rendre l'aide contextuelle

**Checklist**

- [ ] Raccourcis permanents audites
- [ ] Statuts simplifies
- [ ] Aide contextuelle ou repliable
- [ ] Verification de la decouvrabilite

### Ticket 10

**Titre**

- Poser une direction visuelle editoriale complete

**Checklist**

- [ ] Axe visuel choisi
- [ ] Tokens et surfaces revisites
- [ ] Hierarchie typo renforcee
- [ ] Captures avant/apres

---

## Plan d'action design

### Phase 1 - Desencombrer

1. Faire un inventaire de tous les elements visibles en permanence.
2. Classer chaque element en `primaire`, `contextuel`, `secondaire`, `cache`.
3. Supprimer ou deplacer tout ce qui n'aide pas l'ecriture dans les 5 premieres secondes.

### Phase 2 - Recentrer le manuscrit

1. Recomposer le centre autour d'une vraie colonne d'ecriture.
2. Reduire la dominance des bordures, capsules et controles.
3. Donner au texte, au titre et aux headings une presence editoriale nette.

### Phase 3 - Repenser la marge

1. Traiter la marge comme un carnet vivant.
2. Faire ressortir les notes avant les commandes.
3. Utiliser hover, menus secondaires et palette pour les actions moins frequentes.

### Phase 4 - Signer visuellement le produit

1. Choisir une direction esthetique explicite.
2. Revoir typographie, contraste, profondeur et rythme des surfaces.
3. Harmoniser topbar, manuscrit, notes, modales et vues d'export.

---

## Criteres de succes globaux

- Aucun crash silencieux sur les parcours critiques.
- Surface de permission Tauri minimisee.
- Persistance fiable et non agressive.
- Export DOCX mieux cadre, teste et documente.
- Un nouveau contributeur peut lancer les verifications locales sans ambiguite.
