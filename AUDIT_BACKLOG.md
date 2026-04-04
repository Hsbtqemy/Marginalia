# Backlog executable - Marginalia

Ce backlog traduit l'audit en travaux concrets, priorises, avec definition of done, livrables, risques et dependances.

## Regles d'execution

- Chaque item doit produire une PR ou un lot de commits autonome.
- Ne pas melanger hardening, UX et gros refactors dans une meme PR.
- Toute tache qui touche a l'export ou a la persistance doit inclure des tests.
- Toute tache qui touche a Tauri doit inclure une verification manuelle Windows au minimum.
- Tant que l'item `SEC-01` n'est pas traite, eviter d'etendre les usages HTML/libres dans l'app.
- Tant que `SCH-03` n'est pas traite, ne pas pousser de refonte purement cosmetique de la marge gauche.
- Tant que `SCH-02` et `SCH-03` ne sont pas traites, `UX-02` et `UX-03` restent des chantiers d'exploration encadree, pas des refontes a stabiliser.

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
| ARCH-01 | P0 | Architecture | Formaliser le modele editorial par unites | M | Eleve |
| SCH-01 | P0 | Produit/UX | Requalifier la marge gauche en scholies | M | Eleve |
| SCH-02 | P0 | Architecture | Deriver un index d'unites depuis le modele actuel | M | Eleve |
| SCH-03 | P0 | Robustesse | Garantir une seule scholie gauche par bloc manuscrit | M | Eleve |
| MAN-01 | P0 | Editeur | Ajouter les operations de bloc cote manuscrit | L | Eleve |
| PAIR-01 | P0 | Editeur | Coordonner les actions au niveau unite | L | Eleve |
| PAIR-02 | P0 | UX | Introduire l'insertion explicite entre unites | M | Moyen |
| PAIR-03 | P1 | UX | Autoriser la scholie vide, reduite ou developpee | S | Faible |
| LAY-01 | P1 | UX/UI | Reequilibrer la grille en faveur du manuscrit | M | Moyen |
| SAFE-01 | P1 | Robustesse | Garder un reorder fiable sans drag souris | S | Moyen |
| MODEL-01 | P1 | Donnees | Introduire un modele canonique de document par unites | L | Eleve |
| MODEL-02 | P1 | Donnees | Migrer les documents existants vers le modele d'unites | L | Eleve |
| QA-02 | P1 | Qualite | Couvrir les invariants du modele scholies | M | Eleve |
| EXP-01 | P1 | Produit | Documenter explicitement les limites de l'export DOCX | S | Faible |
| EXP-02 | P2 | Export | Augmenter la fidelite de l'export DOCX | L | Moyen |
| EXP-03 | P2 | Export | Aligner l'export avec les unites editoriales | M | Moyen |
| UX-01 | P2 | UX | Remplacer `prompt/confirm` par des modales natives de l'app | M | Faible |
| UX-02 | P1 | UX/UI | Recentrer l'app sur l'ecriture par unites | L | Eleve |
| UX-03 | P1 | UX/UI | Transformer la marge gauche en appareil de scholies | L | Eleve |
| UX-04 | P1 | UX/UI | Reduire le bruit permanent et rendre l'aide contextuelle | M | Moyen |
| UX-05 | P2 | UX/UI | Installer une direction visuelle editoriale complete | L | Moyen |
| UX-06 | P2 | UX/UI | Recomposer la topbar et la navigation document | M | Moyen |
| DX-01 | P2 | DX | Corriger les details de finition du projet | S | Faible |

## Etat d'avancement (2026-04-04)

| ID | Statut |
|---|---|
| SEC-01 | done |
| PERF-01 | done |
| REL-01 | done |
| DATA-01 | done |
| SEC-02 | done |
| DATA-02 | done |
| QA-01 | done |
| ARCH-01 | done |
| SCH-01 | done |
| SCH-02 | done |
| SCH-03 | todo |
| MAN-01 | todo |
| PAIR-01 | todo |
| PAIR-02 | todo |
| PAIR-03 | todo |
| LAY-01 | todo |
| SAFE-01 | todo |
| MODEL-01 | todo |
| MODEL-02 | todo |
| QA-02 | todo |
| EXP-01 | done |
| EXP-02 | todo |
| EXP-03 | todo |
| UX-01 | done |
| UX-02 | in progress |
| UX-03 | in progress |
| UX-04 | in progress |
| UX-05 | in progress |
| UX-06 | in progress |
| DX-01 | done |

### Resume

- done: 13
- in progress: 5
- todo: 11
- hors backlog initial (critique): `New linked note` est durci et couvert par tests; le resize pointeur a replanete lors de la validation manuelle Windows/Tauri du 2026-04-02 et reste desactive en attendant une correction de fond
- reorientation produit le 2026-04-04: `ARCH-01` est formalise; `UX-02`, `UX-03` et une partie de `UX-04` sont maintenant executes via le programme `scholies` ci-dessous

### Reste a faire priorise

1. `SCH-03`: implementer l'invariant restant du cadre editorial fixe par `ARCH-01` avant de pousser plus loin le redesign.
2. `MAN-01`, `PAIR-01`, `PAIR-02`, `PAIR-03`, `SAFE-01`: faire passer l'app d'un manuscrit continu annote a une suite d'unites `bloc + scholie`.
3. `LAY-01`, `UX-04`, `UX-05`, `UX-06`: retendre la hierarchie visuelle et la chrome autour du nouveau modele.
4. `MODEL-01`, `MODEL-02`, `QA-02`: basculer la persistance et la couverture de tests vers le modele d'unites une fois l'UX validee.
5. `EXP-03`, puis `EXP-02`: aligner l'export avec les unites editoriales avant d'augmenter la fidelite DOCX.
6. Hors backlog initial critique: corriger le crash du resize pointeur sous Windows/Tauri, puis revalider les scenarios resize, changement de document et `New linked note`.

---

## Validation manuelle Windows/Tauri

### Checklist critique - resize pointeur et `New linked note`

**Pre-requis**

- lancer `npm run tauri:dev` sur Windows
- ouvrir au moins deux documents de test
- verifier que les trois panneaux sont visibles au moins une fois pendant la passe

**CRIT-02 - Resize pointeur**

1. Resize gauche, relacher dans la fenetre
   - attendu: la taille change
   - attendu: le curseur revient a la normale apres relachement
   - attendu: tous les clics restent fonctionnels
   - resultat 2026-04-02: KO, l'app replante comme lors de la passe precedente; le resize pointeur reste desactive apres rollback de securite
2. Resize gauche, relacher hors fenetre
   - attendu: aucun etat bloque au retour dans la fenetre
   - attendu: le curseur n'est pas fige en `col-resize`
3. Resize droite, puis `Alt+Tab`
   - attendu: retour dans l'app sans gel d'input
   - attendu: les panneaux restent interactifs
4. Resize puis `Escape`
   - attendu: fin immediate du resize
   - attendu: aucune capture pointeur residuelle visible
5. Resize puis changement de document
   - attendu: changement de document normal
   - attendu: aucun panneau ne reste dans un etat de resize

**CRIT-03 - `New linked note`**

1. Depuis une selection manuscrit existante
   - action: declencher `New linked note`
   - attendu: une seule note liee est creee
   - attendu: elle pointe vers le bon block manuscrit
   - attendu: le focus final est dans la note
2. Sans block manuscrit courant clair
   - action: declencher `New linked note`
   - attendu: un passage manuscrit est cree ou reutilise une seule fois
   - attendu: pas de doublon manuscrit / note
3. Declenchement suivi d'un changement de document
   - action: lancer `New linked note`, puis changer immediatement de document
   - attendu: rien n'est cree dans le mauvais document
   - attendu: aucun freeze ni erreur visible
4. Declenchement via plusieurs entrees
   - action: tester au minimum toolbar et palette de commandes
   - attendu: meme comportement et meme resultat final

**Critere de cloture**

- aucun clic bloque
- aucun curseur fige
- aucun doublon de passage ou de note liee
- aucun artefact sur changement de document
- si un scenario casse: noter scenario exact, document, sequence, resultat observe

---

## Programme Scholies - priorite produit 2026-04-04

Ce programme re-scopie `UX-02`, `UX-03` et une partie de `UX-04` pour faire evoluer Marginalia vers un modele de document compose d'unites editoriales, plutot que d'un manuscrit continu accompagne de notes plus ou moins libres.

### Principes de conception

- Une unite = `1 bloc principal + 1 scholie gauche maximum + 0/1 scholie vide`.
- L'ajout d'une unite est explicite: l'utilisateur choisit ou inserer un nouveau bloc.
- Les actions structurelles portent sur l'unite complete: ajouter, supprimer, dupliquer, deplacer.
- La scholie gauche est un commentaire situe, pas un objet autonome de type "carte".
- Le panneau droit reste un espace secondaire de sources, annexes ou citations tant que le nouveau modele n'est pas stabilise.

### Base existante a reutiliser

- Le manuscrit sait deja identifier ses blocs via `blockId` dans `src/editors/manuscript/lexicalBlocks/manuscriptBlockUtils.ts`.
- La marge gauche a deja un vrai noeud de bloc avec `marginBlockId` et `linkedManuscriptBlockId` dans `src/editors/margin/marginaliaBlocks/MarginaliaBlockNode.ts`.
- La marge sait deja inserer, deplacer, supprimer, dupliquer, scinder et fusionner ses blocs dans `src/editors/margin/marginaliaBlocks/commands.ts`.
- L'app sait deja coordonner la creation d'une note liee via `src/app/linkedMarginalia.ts` et `src/app/App.tsx`.
- La persistance actuelle est encore separee en trois etats `manuscriptJson`, `leftMarginJson`, `rightMarginJson` dans `src/db/queries.ts` et `src/state/useAppStore.ts`.

### Ordre recommande

1. Implementer le vocabulaire et les invariants a partir de `ARCH-01`: `SCH-01`, `SCH-02`, `SCH-03`.
2. Introduire les operations de structure cote manuscrit puis au niveau unite: `MAN-01`, `PAIR-01`, `PAIR-02`, `PAIR-03`.
3. Recomposer l'interface autour des unites et de la lecture: `LAY-01`, `UX-04`, `UX-06`, `UX-05`.
4. Seulement apres validation manuelle du nouveau comportement, basculer la persistance: `MODEL-01`, `MODEL-02`.
5. Fermer avec `QA-02` et `EXP-03`, puis reprendre `EXP-02`.

### ARCH-01 - Formaliser le modele editorial par unites

**Statut**

- done le 2026-04-04

**Pourquoi**

- Le code actuel pense encore en termes de "manuscrit + marges".
- Sans invariant produit explicite, chaque retouche UX risque de repartir vers un modele de notes libres.

**Objectif**

- Definir noir sur blanc la structure cible: unite, scholie, insertion, suppression, deplacement, duplication, panneau droit.

**Decision centrale**

- Le document cible n'est plus pense comme une page infinie accompagnee de marges semi-autonomes.
- Le document cible est une sequence ordonnee d'unites editoriales.
- Une unite editoriale est ancree par un bloc manuscrit et peut porter au plus une scholie gauche.
- La scholie gauche est un commentaire associe au bloc, pas une note libre de premier rang.
- Le panneau droit reste secondaire pendant la transition et ne definit pas l'unite editoriale.

**Invariants verrouilles**

1. Le document est compose d'une sequence finie et ordonnee d'unites.
2. Chaque unite possede exactement un bloc principal manuscrit.
3. Chaque unite peut posseder zero ou une scholie gauche, jamais plus.
4. Une scholie gauche peut etre vide, reduite ou developpee; son existence ne doit pas forcer un contenu immediat.
5. L'ordre des unites est l'ordre des blocs manuscrit; la scholie suit cet ordre et ne le pilote pas.
6. Ajouter une unite signifie inserer explicitement un nouveau bloc principal a un endroit choisi du document.
7. Supprimer une unite supprime le bloc principal et sa scholie associee.
8. Deplacer une unite deplace le bloc principal et sa scholie associee comme un ensemble logique.
9. Dupliquer une unite duplique le bloc principal et sa scholie associee avec de nouveaux identifiants.
10. Un bloc manuscrit sans scholie reste une unite valide.
11. Une scholie gauche sans bloc manuscrit correspondant n'est pas un etat cible valide.
12. Le panneau droit n'entre pas dans l'invariant d'unite tant que `MODEL-01` n'a pas redefini son role.

**Types de blocs concernes**

- Sont des blocs principaux eligibles:
  - paragraphe top-level;
  - titre top-level;
  - citation top-level;
  - item de liste top-level.
- La granularite cible reste donc le bloc editorial deja present dans le manuscrit, pas la phrase ni la page.

**Non-objectifs explicites**

- Ne pas transformer le produit en page infinie ou en canvas libre.
- Ne pas autoriser plusieurs scholies gauches simultanees pour un meme bloc manuscrit.
- Ne pas remodeler le panneau droit comme seconde scholie avant d'avoir stabilise le panneau gauche.
- Ne pas rendre le drag souris obligatoire pour les operations de structure.
- Ne pas migrer la base avant d'avoir valide l'ergonomie du modele derive.

**Regles de transition**

1. Tant que `MODEL-01` n'est pas traite, l'app continue de persister `manuscriptJson`, `leftMarginJson` et `rightMarginJson` separement.
2. Tant que `SCH-02` n'est pas traite, l'UI continue de fonctionner sur le modele existant, avec une projection derivee a introduire.
3. Tant que `SCH-03` n'est pas traite, des documents herites peuvent encore contenir plusieurs notes liees a un meme bloc; cet etat doit etre considere comme legacy et non comme un comportement produit valide.
4. Tant que `SAFE-01` n'est pas ferme, les operations de structure doivent rester faisables sans drag pointeur.

**Cas limites a encadrer**

1. Si l'utilisateur cree une scholie sur un bloc qui en a deja une, l'action doit reutiliser ou focaliser la scholie existante plutot que creer un doublon.
2. Si un document ancien contient plusieurs scholies gauches pour un meme bloc, `SCH-03` doit definir la regle de normalisation ou de priorisation.
3. Si l'utilisateur insere une unite sans selection courante, l'app doit utiliser un point d'insertion explicite ou un fallback clair.
4. Si l'utilisateur supprime le contenu textuel d'une scholie, l'unite reste valide tant que le bloc manuscrit existe.
5. Si le bloc manuscrit est deplace, la scholie reste associee au meme `blockId` ou a son equivalent apres operation structurelle.

**Implications UI**

1. Le CTA primaire n'est plus conceptuellement `New Note`, mais `ajouter une unite`, `ajouter un bloc` ou `ajouter une scholie a un bloc`.
2. La marge gauche ne doit plus se presenter comme un tableau de cartes autonomes.
3. Les actions `supprimer`, `dupliquer`, `deplacer` doivent etre pensees d'abord au niveau unite, puis exposees dans les outils.
4. L'etat vide du document doit encourager la construction bloc par bloc.
5. `UX-02` et `UX-03` ne peuvent etre stabilises qu'en respectant ces invariants.

**Travaux**

1. Figer les invariants fonctionnels du couple `bloc principal + scholie`.
2. Definir ce qui est autorise ou non:
   - maximum une scholie gauche par bloc manuscrit;
   - scholie gauche vide autorisee;
   - insertion explicite entre deux unites;
   - suppression/deplacement/duplication au niveau unite.
3. Decider le role du panneau droit pendant la transition:
   - annexe de sources;
   - citations;
   - ou simple panneau secondaire non structurel.
4. Lister les ecrans et commandes a re-scoper: toolbar manuscrit, toolbar marge, palette, topbar, placeholders.

**Definition of done**

- Les invariants sont documentes dans ce backlog et servent de reference.
- Les nouveaux tickets `SCH-*`, `PAIR-*`, `MODEL-*` sont valides par rapport a ces invariants.
- Les non-objectifs et cas limites principaux sont explicites.
- Les tickets UX ouverts n'entrent pas en contradiction avec ce cadre.

**Dependances**

- Aucune.

---

### SCH-01 - Requalifier la marge gauche en scholies

**Statut**

- done le 2026-04-04

**Pourquoi**

- Le composant de marge est encore concu comme un espace de notes libres, avec vocabulaire et affordances de type "note".
- Le noeud `marginalia-block` sait deja porter un lien, mais pas encore un statut de scholie au sens produit.

**Objectif**

- Faire de la marge gauche un espace de scholies associees au texte, meme avant migration complete du modele.

**Travaux**

1. Revoir le vocabulaire UI:
   - remplacer `New Note`, `Free note`, `Linked note` par un lexique coherent avec les scholies.
2. Revoir les placeholders et textes de guidage dans `ManuscriptEditor` et `MarginEditorBase`.
3. Distinguer clairement:
   - scholie associee a un bloc;
   - annexe libre eventuelle, si elle subsiste pendant la transition.
4. Ajouter un marqueur discret d'association au bloc source sans rebasculer vers une "carte" riche en chrome.

**Definition of done**

- La marge gauche ne se presente plus comme un carnet de notes generique.
- Le vocabulaire visible pour l'utilisateur est coherent avec l'idee de scholie.
- Aucun element important de l'UI ne contredit le modele `bloc + scholie`.

**Dependances**

- `ARCH-01`.

---

### SCH-02 - Deriver un index d'unites depuis le modele actuel

**Statut**

- done le 2026-04-04

**Pourquoi**

- La persistance est encore scindee entre manuscrit, marge gauche et marge droite.
- Il faut pouvoir prototyper l'interface cible sans lancer trop tot une migration de donnees.

**Objectif**

- Construire, a l'execution, une vue derivee des unites a partir des `blockId` manuscrit et des liens de marge gauche.

**Travaux**

1. Introduire un helper de projection qui reconstitue des unites a partir de:
   - `manuscriptJson`;
   - `leftMarginJson`;
   - `leftLinksByManuscriptBlockId`.
2. Definir la forme de cette projection:
   - `unitId`;
   - `manuscriptBlockId`;
   - `leftMarginBlockId | null`;
   - ordre;
   - extrait ou meta utiles a l'UI.
3. Brancher cette projection dans `App.tsx` ou dans un module derive dedie, sans casser le store existant.
4. Documenter clairement que cette projection reste transitoire tant que `MODEL-01` n'est pas traite.

**Definition of done**

- L'app peut raisonner en "unites" sans encore changer la base.
- La projection est stable sur reload et sur changement de document.
- Les ecrans futurs peuvent consommer cette vue derivee au lieu de recalculer localement des associations.

**Dependances**

- `ARCH-01`.

---

### SCH-03 - Garantir une seule scholie gauche par bloc manuscrit

**Pourquoi**

- Le flux `New linked note` cree aujourd'hui une note liee, mais ne garantit pas encore le modele `1 bloc = 1 scholie gauche max`.
- Sans cet invariant, toute UI par unites restera fragile.

**Objectif**

- Faire de la marge gauche un commentaire unique associe a chaque bloc principal.

**Travaux**

1. Modifier `createLinkedMarginaliaScheduler` et les commandes de marge pour reutiliser une scholie existante au lieu de creer un doublon.
2. Definir le comportement si plusieurs scholies liees existent deja sur un document ancien:
   - ouvrir la premiere;
   - signaler l'anomalie;
   - ou lancer une normalisation.
3. Ajouter une normalisation de lecture pour les documents herites si necessaire.
4. Couvrir les cas suivants:
   - creation repetee depuis la toolbar;
   - creation via palette;
   - changement rapide de document;
   - document ancien avec doublons.

**Definition of done**

- `New linked note` ne cree plus de doublon gauche pour un meme `blockId`.
- Un document ancien avec doublons ne plante pas et suit une regle definie.
- Les tests couvrent cet invariant.

**Dependances**

- `ARCH-01`
- `SCH-02`

---

### MAN-01 - Ajouter les operations de bloc cote manuscrit

**Pourquoi**

- Le manuscrit sait deja creer ou cibler un bloc, mais pas encore se comporter comme une suite d'unites manipulables.
- Tant que les operations de structure n'existent que cote marge, on reste dans un modele asymetrique.

**Objectif**

- Permettre au manuscrit de manipuler explicitement ses blocs comme des fragments ordonnes.

**Travaux**

1. Ajouter les primitives cote manuscrit:
   - inserer un bloc avant/apres;
   - supprimer le bloc courant;
   - dupliquer le bloc courant;
   - deplacer le bloc courant vers le haut ou le bas.
2. Reutiliser `blockId` comme cle structurelle stable.
3. Definir le comportement sur les listes top-level, titres, citations et paragraphes.
4. Ajouter des commandes et raccourcis clavier seulement si l'UX reste lisible.

**Definition of done**

- Le manuscrit peut etre construit bloc par bloc sans hacks de selection.
- Les operations marchent sur les types de blocs deja supportes.
- Les ids de blocs restent stables apres deplacement ou duplication.

**Dependances**

- `ARCH-01`
- `SCH-02`

---

### PAIR-01 - Coordonner les actions au niveau unite

**Pourquoi**

- Les operations de marge et de manuscrit sont encore majoritairement separees.
- Le produit cible demande que les actions structurelles portent sur le couple `bloc + scholie`.

**Objectif**

- Introduire un coordinateur d'actions capable de manipuler une unite complete.

**Travaux**

1. Ajouter dans `App.tsx` ou un module dedie des actions de haut niveau:
   - `createUnitAfter`
   - `deleteCurrentUnit`
   - `duplicateCurrentUnit`
   - `moveCurrentUnitUp`
   - `moveCurrentUnitDown`
2. Faire cooperer `ManuscriptEditorHandle` et `LeftMarginEditorHandle` pour ces actions.
3. Preserver le focus utilisateur apres chaque action.
4. Definir les regles pour les unites sans scholie et pour les documents herites.

**Definition of done**

- Une action structurelle sur le manuscrit emporte sa scholie gauche associee.
- Le resultat reste correct apres autosave, reload et changement de document.
- Les commandes niveau unite sont centralisees dans une seule couche.

**Dependances**

- `MAN-01`
- `SCH-03`

---

### PAIR-02 - Introduire l'insertion explicite entre unites

**Pourquoi**

- Ton modele demande un geste explicite de construction.
- Aujourd'hui, la creation passe surtout par la selection courante et `New linked pair`.

**Objectif**

- Faire de l'ajout de bloc une action situee entre deux unites, lisible et maitrisable.

**Travaux**

1. Introduire une affordance d'insertion entre blocs manuscrit:
   - bouton `+` discret entre unites;
   - ou commande contextuelle apparue au focus/hover.
2. Faire que cette action cree:
   - un bloc manuscrit vide;
   - une scholie associee vide ou reduite.
3. Verifier les etats:
   - document vide;
   - insertion en debut;
   - insertion entre deux unites;
   - insertion en fin.
4. Maintenir un chemin clavier et palette pour les utilisateurs rapides.

**Definition of done**

- L'utilisateur peut construire explicitement son document par unites.
- L'ajout d'un bloc n'oblige plus a passer par une selection preexistante.
- Le document vide devient un point de depart clair pour ce modele.

**Dependances**

- `MAN-01`
- `PAIR-01`

---

### PAIR-03 - Autoriser la scholie vide, reduite ou developpee

**Pourquoi**

- Si chaque bloc impose une scholie pleine, l'ecriture devient trop lourde.
- Il faut garder la structure ferme tout en laissant l'edition souple.

**Objectif**

- Faire de la scholie un element associe mais non intrusif.

**Travaux**

1. Definir trois etats simples:
   - vide;
   - reduite;
   - developpee.
2. Choisir comment ces etats s'expriment visuellement sans chrome excessif.
3. Conserver l'association au bloc meme quand la scholie est vide.
4. Verifier que la suppression d'une scholie vide ne casse pas l'unite.

**Definition of done**

- Une unite peut exister avec une scholie vide.
- La scholie n'impose pas un rituel d'edition a chaque ajout de bloc.
- Les etats sont lisibles sans saturer la marge.

**Dependances**

- `SCH-01`
- `PAIR-02`

---

### LAY-01 - Reequilibrer la grille en faveur du manuscrit

**Pourquoi**

- La grille actuelle reste celle de trois panneaux equivalents ou presque.
- Une scholie doit vivre au bord du texte, pas rivaliser avec lui comme un deuxieme editeur principal.

**Objectif**

- Faire du manuscrit la colonne dominante, avec une marge gauche plus fine, plus typographique et moins "app".

**Travaux**

1. Revoir `ThreePaneLayout` et les largeurs par defaut pour que le centre domine clairement.
2. Sortir la marge gauche du look "cartes" actuel:
   - moins de fonds pleins;
   - moins de bordures lourdes;
   - moins de badges;
   - plus de typographie et de rythme vertical.
3. Reduire la masse visuelle des toolbars et des chips autour de la marge.
4. Verifier la coherence sur document vide, document long et `Untitled Draft`.

**Definition of done**

- Au premier regard, le manuscrit domine l'ecran.
- La marge gauche accompagne la lecture au lieu de ressembler a un panneau d'objets.
- Les differences de disposition entre documents restent sous controle.

**Dependances**

- `SCH-01`
- `PAIR-02`

---

### SAFE-01 - Garder un reorder fiable sans drag souris

**Pourquoi**

- Le drag souris reste instable sous Tauri/WebView2.
- Le modele par unites a besoin d'un reorder fiable, mais pas necessairement souris en premier.

**Objectif**

- Assurer le deplacement d'unites par clavier et commandes tant que le drag pointeur n'est pas digne de confiance.

**Travaux**

1. Conserver le drag souris desactive tant qu'une validation Windows ne le ferme pas.
2. Renforcer les commandes de deplacement clavier/boutons pour qu'elles couvrent le besoin principal.
3. Verifier que le reorder d'unite agit bien sur le bloc principal et sa scholie.
4. Documenter la reouverture eventuelle du drag souris comme un ticket separe.

**Definition of done**

- Le produit permet de reordonner les unites sans drag souris.
- Aucun scenario critique ne depend du pointer drag.
- Le backlog distingue bien securisation et confort souris.

**Dependances**

- `PAIR-01`

---

### MODEL-01 - Introduire un modele canonique de document par unites

**Pourquoi**

- La projection derivee `SCH-02` suffira pour prototyper, pas pour stabiliser durablement le produit.
- Le stockage en trois etats separes rend les invariants d'unites fragiles.

**Objectif**

- Donner au document un modele persistant centre sur l'unite editoriale.

**Travaux**

1. Choisir la forme canonique:
   - table `document_units`;
   - ou JSON structure unique;
   - avec ordre, `unitId`, bloc principal et scholie associee.
2. Documenter le choix au regard de l'existant SQLite/Tauri.
3. Definir comment le panneau droit s'articule avec ce modele.
4. Introduire un repository ou service de lecture/ecriture dedie.

**Definition of done**

- Le modele de persistance cible est choisi et documente.
- Les invariants produit y sont representables sans contorsion.
- Un plan de migration concret vers ce modele existe.

**Dependances**

- `ARCH-01`
- validation UX initiale de `PAIR-01` et `PAIR-02`

---

### MODEL-02 - Migrer les documents existants vers le modele d'unites

**Pourquoi**

- Le projet a deja des documents stockes selon l'ancien modele.
- Une refonte de donnees sans migration casserait la confiance utilisateur.

**Objectif**

- Convertir les documents existants sans perte de contenu ni corruption des liens.

**Travaux**

1. Ecrire la strategie de migration depuis:
   - `manuscript_states`;
   - `margin_left_states`;
   - `margin_right_states`.
2. Definir la regle pour les cas ambigus:
   - doublons de scholies;
   - notes libres non liees;
   - blocs manuscrit sans scholie;
   - scholies sans bloc manuscrit valide.
3. Ajouter un mode lecture/normalisation pour les anciens documents tant que la migration n'est pas finalisee.
4. Tester la migration sur des fixtures representatifs.

**Definition of done**

- Un document existant peut etre ouvert dans le nouveau modele sans perte manifeste.
- Les cas ambigus suivent une regle explicite et testee.
- Le rollback ou la compatibilite de lecture est defini.

**Dependances**

- `MODEL-01`
- `QA-02`

---

### QA-02 - Couvrir les invariants du modele scholies

**Pourquoi**

- Le futur comportement repose sur des invariants plus stricts que l'etat actuel.
- Ces invariants doivent etre testes avant et pendant la migration du modele.

**Objectif**

- Avoir des tests qui protgent explicitement le couple `bloc + scholie`.

**Travaux**

1. Ajouter des tests sur:
   - unicite de la scholie gauche par `blockId`;
   - creation d'unite;
   - suppression d'unite;
   - duplication d'unite;
   - deplacement d'unite;
   - migration de documents anciens.
2. Ajouter au moins un scenario d'integration couvrant la coordination `App + manuscrit + marge gauche`.
3. Etendre les fixtures de donnees pour les cas herites et ambigus.

**Definition of done**

- Les invariants du modele scholies sont couverts par des tests nommes explicitement.
- Une regression sur la relation `bloc principal <-> scholie` casse la suite de tests.
- La migration de donnees a des fixtures de reference.

**Dependances**

- `SCH-03`
- `PAIR-01`
- `MODEL-01`

---

### EXP-03 - Aligner l'export avec les unites editoriales

**Pourquoi**

- Si le produit devient une suite d'unites, l'export ne peut plus raisonner seulement comme un manuscrit principal accompagne d'annexes.

**Objectif**

- Faire de l'export un reflet du nouvel ordre editorial.

**Travaux**

1. Definir comment une unite se traduit en PDF/print preview et en DOCX.
2. Decider si la scholie est:
   - inline;
   - en note;
   - en annexe;
   - ou configurable selon le profil.
3. Adapter les payloads d'export quand `MODEL-01` sera en place.
4. Ajouter une matrice de sortie `unite -> export`.

**Definition of done**

- L'export respecte l'ordre des unites editoriales.
- Le role de la scholie dans les sorties est explicite et documente.
- La nouvelle logique ne reintroduit pas de lecture implicite de trois etats de document separes.

**Dependances**

- `MODEL-01`
- `MODEL-02`
- idealement apres `QA-02`

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

**Statut**

- done le 2026-04-01
- fait:
  - `npm run verify` ajoute
  - workflow GitHub Actions `Verify` ajoute
  - tests ajoutes sur `src/db/queries.ts`
  - tests ajoutes sur `src/db/writeUtils.ts`
  - tests ajoutes sur les invariants de linking critiques
  - ordre des tests TypeScript rendu deterministe
  - verification locale complete passee via `npm run verify`
  - verification distante observee verte sur `qa/verify-main-2026-04-01` pour le commit `3bd5107`

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

### UX-02 - Recentrer l'app sur l'ecriture par unites

**Pourquoi**

- Le manuscrit n'est pas encore la zone dominante de l'interface.
- L'app ressemble davantage a un outil de debug/edition qu'a un environnement de composition par fragments.

**Objectif**

- Faire du texte l'element visuel principal, avec une vraie colonne d'ecriture et une hierarchie claire au service d'une suite d'unites editoriales.

**Travaux**

1. S'appuyer sur `ARCH-01`, puis executer `MAN-01`, `PAIR-01`, `PAIR-02` et `LAY-01`.
2. Faire du manuscrit la colonne dominante, meme hors mode page preview.
3. Repenser les ecrans vides et les gestes de construction pour un document par unites.
4. Diminuer la masse visuelle des outils par rapport au texte.
5. Verifier que la vue par defaut est accueillante sur document vide comme sur document long.

**Definition of done**

- Au premier regard, le manuscrit domine clairement l'ecran.
- Le centre ne ressemble plus a un panneau d'outil.
- La zone de texte garde une largeur et une respiration coherentes en desktop.
- Les actions de structure principales se comprennent comme des actions sur une unite.

**Livrables**

- Refonte des surfaces du centre.
- Ajustements CSS et actions structurelles alignes sur le modele par unites.
- Validation visuelle sur ecran vide et ecran rempli.

**Dependances**

- A traiter avant `UX-05`.

---

### UX-03 - Transformer la marge gauche en appareil de scholies

**Pourquoi**

- La marge gauche fonctionne, mais son langage visuel actuel reste celui d'un panneau de notes ou de commandes.
- Elle ne valorise pas assez la relation structurelle entre un bloc de texte et sa scholie.

**Objectif**

- Faire de la marge gauche un appareil critique discret, lie au texte, lisible et typographique.

**Travaux**

1. Executer `SCH-01`, `SCH-03`, `PAIR-03` et `LAY-01`.
2. Faire passer la marge d'un espace "notes" a un espace de scholies associees.
3. Rendre les metadonnees de liaison plus discretes et plus editoriales.
4. Mieux mettre en scene l'extrait du passage lie sans reintroduire une "carte".
5. Deplacer les actions secondaires hors de la vue primaire si necessaire.

**Definition of done**

- La marge ressemble a un bord critique du texte, pas a un panneau de commandes.
- Les scholies sont plus lisibles que les boutons.
- Les actions critiques restent accessibles sans saturer la vue.

**Livrables**

- Recomposition de la marge.
- Etats de scholie plus lisibles.
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

- Recentrer Marginalia sur l'ecriture par unites

**Checklist**

- [ ] Colonne de manuscrit plus editoriale
- [ ] Hierarchie visuelle recentree sur le texte
- [ ] Gestes de construction par unite clarifies
- [ ] Toolbars declasses visuellement
- [ ] Validation ecran vide / ecran rempli

### Ticket 8

**Titre**

- Transformer la marge en appareil de scholies

**Checklist**

- [ ] Vocabulaire de scholies coherent
- [ ] Actions moins dominantes
- [ ] Scholies plus lisibles que la chrome
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
