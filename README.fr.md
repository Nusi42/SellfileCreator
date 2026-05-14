# Sellfile Creator for RSL Helper

Sellfile Creator simplifie la création de fichiers de vente pour RSL Helper — définissez des filtres par ensemble, emplacement, stat principale, sous-stats et plus encore, prévisualisez les résultats en direct et exportez des fichiers de vente prêts à l'emploi en quelques secondes.

> Projet de fans indépendant. Aucune affiliation avec Plarium, Raid: Shadow Legends ou RSL Helper. Toutes les marques citées appartiennent à leurs propriétaires.

## Fonctionnalités

- **Générateur de recettes** — créez des recettes de conservation/vente nommées avec des
  filtres par emplacement, ensemble, rang, rareté, stat principale, sous-stats (avec
  minimums de rolls et cibles), faction et paliers de niveau. Constituez une bibliothèque
  réutilisable et exportez-la en fichier de vente RSL Helper (`.hsf`) en un clic.
- **Aperçu du Sellfile** — prévisualisez le fichier de vente RSL Helper généré
  dans l'onglet Aperçu avant d'exporter.
- **Métasets** — regroupez des ensembles d'équipements (ex. Vitesse + Perception) en
  collections nommées et réutilisez-les dans vos recettes et protections.
- **Inspecteur d'équipement** — connectez RSL Helper pour une synchronisation en direct ou chargez un fichier `.db` pour prévisualiser les objets correspondant à chaque recette et combien seraient conservés ou vendus.
- **Simulateur de donjon** — consultez les pourcentages de chance de conservation pour le
  Chevalier du Feu, le Dragon et le Golem de Glace selon les niveaux de difficulté et de
  mise à niveau pour confirmer l'effet de votre fichier de vente lors du farming ou de
  l'amélioration d'équipements.
- **Protections** — définissez des combinaisons emplacement/ensemble/stat que vous ne
  voulez jamais perdre ; le scanner injecte automatiquement des règles de conservation dans
  le fichier de vente lorsque votre configuration risquerait d'épuiser une combinaison
  protégée en dessous de son quota.
- **Analyse d'équipement** — tableau de bord analytique avec indicateurs clés, graphiques
  à filtre croisé (emplacement, rang, rareté, source, niveau), une arborescence des
  ensembles, des barres de stats principales et un radar de sous-stats. Cliquez sur un
  graphique pour filtrer tous les autres ; envoyez le filtre actif directement dans
  l'Inspecteur d'équipement.
- **Vente finale** — un seul bouton ajoute des règles de vente fourre-tout pour les
  équipements non correspondants selon des plages de niveaux configurables, afin que rien
  ne passe entre les mailles.

## Mode d’emploi

### Fichier de recettes
- SFC (`.sfc`) : fichier projet spécifique à l’application. Considérez-le comme une sauvegarde que vous pouvez charger ou partager. RSL Helper ne lit pas directement SFC.
- HSF (`.hsf`) : la Sellfile consommée par RSL Helper. Exportez-la ici puis chargez-la dans RSL Helper.
- Nom par défaut lors de l’enregistrement : `SellfileCreatorRecipes_AAAA MM JJ_HHMM.sfc`.

### Recettes Builder
- Renseignez les champs du Recettes Builder et attribuez un nom clair à votre recette.
- Cliquez sur « Ajouter comme nouvelle recette » pour l’enregistrer. Sélectionnez ensuite la recette dans la liste sous le builder pour l’éditer, puis validez avec « Mettre à jour la recette sélectionnée ».
- Charger/Enregistrer : utilisez « Charger des recettes » et « Enregistrer des recettes » pour réutiliser vos règles. Ces actions conservent tout ce qu’il faut pour reconstruire l’aperçu.
  - Faites un clic droit sur **Charger fichier SFC** pour ouvrir le menu contextuel : **Charger depuis un fichier…** ouvre le sélecteur de fichiers habituel ; **Charger SFC exemple** charge une configuration d’exemple intégrée après une confirmation (votre configuration actuelle sera remplacée).
- Menus Réinitialiser/Insérer/Appliquer : clic droit sur Réinitialiser, Insérer comme recette ou Appliquer à la recette pour ouvrir le menu partagé. Sauvegardez l’état actuel du builder comme modèle par défaut, retournez aux réglages d’usine, activez Réinitialisation auto après insertion (vide immédiatement le builder après l’insertion d’une recette) ou activez Application auto à la recette sélectionnée (pousse les modifications vers la recette en surbrillance automatiquement après ~400 ms d’inactivité). Réinitialisation auto et Application auto ne peuvent pas coexister : activer l’une désactive l’autre, et ces préférences persistent entre les sessions.
- Note : cliquez sur « Ajouter une note… » (ou « Modifier la note… ») pour joindre une note au fichier de recettes. Lors du chargement d’un fichier contenant une note, celle-ci s’affiche automatiquement. Utilisez `<!-- recipes:1,0 -->` pour insérer des puces de recettes précises (0 prend la suivante). Utilisez `<!-- recipes-re:"speed" -->` pour afficher toutes les recettes dont le nom correspond au motif (insensible à la casse). Ajoutez `<!-- dungeon-simulator -->` pour afficher un tableau en direct des probabilités de conservation pour le Chevalier du Feu, le Dragon et le Golem de Glace sur trois niveaux de difficulté (N20/N25/H10) et deux modes de boost, avec les taux de conservation à +0/+4/+8/+12/+16. Ajoutez `<!-- recipe-overrides [columns=N] -->` pour intégrer des cartes de questions interactives (groupes radio/case à cocher) qui remplacent les modes d'exportation et les paramètres des recettes pour la session — les recettes stockées ne sont jamais modifiées. Ajoutez `<!-- safeguard-overrides [columns=N] -->` pour intégrer des cartes de curseurs et d'options qui remplacent les propriétés des protections (quantité, activation, sous-stats, probabilité d'amélioration, etc.) pour la session — les règles stockées ne sont jamais modifiées. Lorsque l'un ou l'autre de ces marqueurs est présent, le pied de la note affiche un bouton **Désactiver / Activer les options dynamiques** et un bouton **Réinitialiser les options**.
- Restauration Autosave : au lancement, le dialogue liste chaque section sauvegardée avec sa propre case. Restaurez uniquement ce dont vous avez besoin — recettes (y compris la puce sélectionnée), méta-sets, Objectifs de sous-stats, reste de Vente finale, note épinglée, panneau de filtres (état ouvert, puces, sections repliées) et importations de l'Inspecteur d'équipement. Laissez une case décochée pour conserver votre travail. Autosave mémorise également quels interrupteurs de Vente finale (Artefacts, Accessoires et plages de niveau) étaient actifs, donc rouvrir le dialogue Outils reflète exactement ce que vous avez exporté la dernière fois.

### Structure du builder (du haut vers le bas)
- Action & Activé : Déterminez ce qui se passe lorsque l’objet correspond.
  - `Conserver` marque l’objet comme Conserver ; RSL Helper le laisse intact.
  - `Vendre` marque l’objet comme Vendre ; RSL Helper le place dans la file de vente.
  - L’interrupteur « Activé dans le Sellfile » décide si les lignes exportées restent actives. Les recettes désactivées sont barrées dans l’aperçu et n’ont aucun effet dans RSL Helper ; activez « Ignorer les règles désactivées lors de l\'export » dans le menu d’export si vous préférez les exclure.
- Rang : Limitez la règle à certains rangs d’étoiles si vous souhaitez traiter différemment les pièces 6★ et 5★. `Peu importe` laisse tout éligible.
- Niveaux : Choisissez un niveau minimum et maximum parmi +0, +4, +8, +12, +16. Les lignes ne sont générées qu’à l’intérieur de cette fenêtre.
- Rareté : `Auto` (recommandé) sélectionne la rareté la plus basse qui respecte vos critères aux niveaux choisis.
  - Pas de minima par stat ni de somme globale ? Auto garde la règle large pour toutes les raretés.
  - Besoin de 1/2/3/4 sous-stats au départ ? Auto garantit que la rareté peut démarrer avec ce nombre (1→≥ Inhabituelle, 2→≥ Rare, 3→≥ Épique, 4→≥ Légendaire).
  - Besoin d’un total de jets ? Auto choisit la rareté la plus basse capable d’atteindre cette somme à +16 (5 jets demandent Mythique).
  - Puce `Auto ≥` (sous Seuils par jalons) : relève le plancher et, en mode Tard, ajoute des branches ≥ supplémentaires aux paliers +4/+8/+12.
    - Cycle : Inhabituelle → Rare → Épique. « Auto ≥ Rare » exclut Inhabituelle.
    - Actif uniquement lorsque Rareté = Auto et Seuils par jalons = Tard. Sinon la puce affiche une barre diagonale.
    - Exemple : Bannière SPD/ATQ% avec 2 jets sur ATQ%. Rareté = Auto, Seuils = Tard, Auto ≥ Épique. Résultat : lignes Épiques à chaque palier et ≥ Légendaire à +8/+12 pour garder les pièces rares admissibles.
  - Avant +16, le builder s’aligne sur le nombre de sous-stats réellement possible pour la rareté. À +16, votre objectif complet s’applique.
- Faction : Restreignez les règles d’accessoires à une faction donnée pour viser une équipe précise. Anneaux, Amulettes et Bannières respectent ce filtre ; l’armure l’ignore, donc `Peu importe` reste le choix sûr.
- Slots : Ciblez certaines pièces (Arme, Bottes, etc.) afin que les objets hors slot ne correspondent pas. Laissez vide pour couvrir tous les slots.
- Sets & Méta-sets : Filtrez sur des sets explicites ou des méta-sets nommés quand seules certaines combinaisons sont autorisées. Vide = tous les sets.
- Stat principale : Définissez les stats principales acceptées.
  - Sélection multiple autorisée ; aucune sélection = tout est valide.
  - Plusieurs stats principales génèrent chacune leur ligne pour rester explicites à l’export.
- Sous-stats : Définissez ce qui compte.
  - Cliquez pour activer ou désactiver une sous-stat. Les verrouillées restent toujours présentes dans les lignes générées.
  - Utilisez le badge cadenas (🔒) à côté du libellé pour la rendre obligatoire ; un clic droit ouvre les raccourcis de verrouillage/déverrouillage et de règles de jets.
  - `Peu importe` réinitialise la sélection et signifie « aucune restriction ». Dès que vous choisissez des sous-stats précis, `Peu importe` se désactive.
  - Chaque ligne applique `max(Obligatoires, verrouillés)` avec un maximum de quatre sous-stats. Verrouiller réserve donc la place.
- Bascule Flex : Si vous avez plus d’options que de sous-stats requis, Flex répartit ces options sur toutes les permutations valides pour générer chaque combinaison. Les verrouillés restent fixés et la bascule se désactive seule lorsqu’il n’y a plus rien à faire tourner.
- Indicateur de jets : Chaque sous-stat sélectionné affiche un cercle pour les améliorations.
  - Clic gauche augmente l’exigence ; clic droit la réduit.
- Depuis ★ : gauche passe sur un minimum vert (0→1→…→5), droite sur une limite supérieure rouge (0→1→…→4).
- Avec une limite supérieure rouge, gauche réduit le plafond (1→0→★) et droite l’augmente (0→1→…→4→★). Minimum et limite supérieure s’excluent mutuellement.
- Objectifs de jets (Base/+1…+5) : Clique droit sur une sous-stat sélectionnée pour ouvrir la grille des objectifs. « Base » capture la valeur à +0 et chaque champ +N suit la valeur après N jets supplémentaires. Laisse un champ vide pour réutiliser tes Objectifs de sous-stats ou clique sur « Utiliser les objectifs globaux de sous-stats » pour effacer l’override. Les puces de l’aperçu se mettent à jour instantanément pour vérifier les valeurs avant l’export.
- Sous-stats obligatoires : Définissez combien de vos sous-stats sélectionnés doivent être présents.
  - `Auto` reste aligné sur votre sélection (max. quatre).
  - Les sous-stats verrouillés (🔒) comptent toujours et des avertissements apparaissent en cas de combinaison impossible.
- Jets minimaux (global) : Fixez le nombre total de jets que doivent partager vos sous-stats sélectionnés ou verrouillés. `0` saute le contrôle global. Tôt n’affiche que les divisions capables d’atteindre l’objectif à +16.
- Jets minimaux verrouillés (🔒) apparaissent dès qu’au moins une sous-stat est verrouillée. Cliquez sur un nombre dans la ligne du cadenas pour réserver ce nombre de jets aux stats verrouillées uniquement ; le reste du builder continue de suivre le minimum global. Si la valeur verrouillée atteint ou dépasse le nombre global surligné, le badge global disparaît pour laisser le cadenas comme seul plancher. Déverrouiller la sous-stat (ou appuyer sur Auto) efface les deux badges ; choisir ensuite une valeur globale plus faible rallume le badge global à côté du cadenas pour identifier le plancher appliqué à chaque stat.
- Exemple : verrouillez SPD et TRC, mettez Jets minimaux = 3 puis réglez la ligne 🔒 sur 2. Le builder exige maintenant 3 jets totaux sur toutes les sous-stats sélectionnées, dont au moins 2 doivent tomber sur SPD/TRC verrouillés. Placer le cadenas sur 3 efface automatiquement le badge global car les deux planchers deviendraient identiques.
- Seuils par jalons : Contrôlez la façon dont les minima par stat s’appliquent avant +16 lorsque vous exigez des jets minimum.
  - `Tôt` suit les jets déjà acquis à chaque palier.
  - `Tard` demande uniquement ce qui doit exister maintenant pour que l’objectif +16 reste atteignable.
  - Le basculement ne compte que si un sous-stat a Min > 0 ou si le minimum global est > 0.

### Niveaux & jets : mémo rapide
- Seuils Tôt : dès que vos exigences sont réalisables, les lignes retombent sur vos Objectifs de sous-stats et se stabilisent. Avant cela, Tôt n’affiche que des combinaisons valides.
- Somme Σ : les jets minimum s’appliquent à la somme totale des jets sur les sous-stats sélectionnés au niveau cible.
- Jokers et somme minimale : Avec uniquement des sous-stats ★ et une somme minimale > 0, Tôt n’affiche que les divisions minimales par palier. Tard répète ces divisions aux paliers précoces et à +16.
- Mythique (5 jets) : La rareté Mythique peut atteindre cinq jets sur un sous-stat à +16 (contre quatre sinon). Lorsqu’elle est autorisée, le générateur tient compte du jet supplémentaire dès +0.

### Objectifs de sous-stats
- Le bouton « Objectifs de sous-stats… » en haut à droite du builder ouvre l’onglet **Objectifs de sous-stats** dans la fenêtre Outils.
- Ces objectifs sont globaux : ils s’appliquent à toutes les recettes.
- Ils déterminent les seuils par plage de niveau (0–3, 4–7, 8–11, 12–15, 16) et servent de repli dans la grille des Objectifs de jets.
- « Réinitialiser » restaure les objectifs recommandés.

### Méta-sets
- Cliquez sur « Gérer les méta-sets… » pour ouvrir le dialogue.
  - Créez ou renommez des méta-sets et choisissez les sets qu’ils contiennent. L’interface reprend la recherche du sélecteur de sets.
  - Des méta-sets de démarrage sont fournis ; éditez-les ou supprimez-les à tout moment.
  - « Réinitialiser » propose des options sûres lorsqu’un méta-set est en cours d’usage (supprimer, remplacer par des sets explicites ou par un autre méta-set).

### Vente finale
- Utilisez l’interrupteur `Vente finale` dans l’en-tête de l’aperçu pour ajouter des règles de vente destinées aux objets restants. L’étiquette reste identique : un remplissage ambré signifie qu’elle est active et un simple contour neutre qu’elle est désactivée.
- Cliquez sur « Outils » à côté de l’interrupteur pour ouvrir l’onglet `Vente finale` et choisir si cela couvre Artefacts, Accessoires et quels intervalles de niveau (0–3, 4–7, 8–11, 12–15, 16). Par défaut la portée reste 0–15 pour éviter la vente de pièces déjà montées à +16.
- Sans `Vente finale`, RSL Helper conserve tout ce qui ne correspond à aucune règle. Une vente n’a lieu que si une règle explicite le demande.
- Avec `Vente finale` active, les règles générées incluent tous les sets connus. L’aperçu indique « Tous les sets connus » pour alléger la vue, mais le fichier exporté liste chacun d’eux.

### Conserver les uniques
- Basculez le builder en mode **Protections** à l’aide du bouton de basculement au-dessus du panneau builder pour marquer les combinaisons que vous refusez de vendre. Activez `Conserver les uniques` pour laisser le scanner ajouter des lignes de conservation (les modifications l’activent aussi automatiquement).
- Les règles « Conserver les uniques » ne « consomment » pas les objets — chaque règle évalue le même pool de candidats. Si une pièce correspond à plusieurs règles, elle compte pour toutes.
- Chaque règle vous permet de choisir slot, sets ou méta-sets, rangs, raretés, stats principales et, pour les accessoires, factions. Laisser un sélecteur vide signifie « n’importe lequel ».
- Le `Mode` décide comment la règle est émise : `Désactivée` la coupe, `Protéger l’existant` ajoute des lignes de conservation pour les correspondances qui seraient vendues jusqu’à atteindre la quota, et `Prévoir les manques` ajoute des règles fictives pour les combinaisons manquantes afin que les nouveaux drops restent protégés jusqu’à la prochaine mise à jour de la base.
- Les sous-stats sont optionnels : choisissez-en un ou plusieurs pour ne compter que les objets qui possèdent ces sous‑stats. La puce de correspondance (`N’importe quel sous-stat` / `Tous les sous-stats` / `Par sous-stat`) décide s’il en faut un, tous, ou si chaque sous‑stat a sa propre quota. Laisser vide signifie : aucun filtre de sous-stats.
- Les sous-stats sélectionnés sont toujours classés avec le score normalisé (glyphes ignorés) ; les poids apparaissent avec `N’importe quel sous-stat` et `Tous les sous-stats`, `Par sous-stat` garde un poids égal (les égalités au seuil restent protégées).
- `≥ Quantité requise` se trouve juste à côté d'un petit groupe de boutons. « Par règle » garde une seule quote-part, et les boutons « Par emplacement », « Par ensemble », « Par faction » et « Par stat principale » peuvent être combinés pour multiplier la quote-part selon chaque mélange concerné (les désactiver tous les quatre ramène automatiquement le mode « Par règle »).
- L’info-bulle de `Quantité requise` affiche la portée active (`X par emplacement × par ensemble × ...`) et une ligne simple des manquants (`({missing} manquants)`).
- Le sélecteur « `Filtrer : {mode}` » (au-dessus de la grille) propose `Tous` et `Sélection`. `Sélection` affiche uniquement les entrées associées à la règle Conserver les uniques actuellement surlignée ; tant qu’aucune règle n’est choisie, le mode reste aligné sur `Tous`.
- L’analyse n’ajoute des lignes de conservation que pour les correspondances qui seraient vendues, et seulement si le quota n’est pas atteint. En `Prévoir les manques`, des règles fictives couvrent aussi les combinaisons manquantes.
- **`Chance d’amélioration ≥ N%`** (éclaireur de talents optionnel) : élargit le filet de sécurité au-delà du top-N standard. Le scanner conserve toujours en priorité les pièces du top-N selon leur valeur de sous-stat **actuelle** — celles-là ne risquent jamais rien. Il protège ensuite toute pièce *hors* de ce top-N dont la chance d’amélioration atteint le seuil. L’idée : « garder les drops bruts qui ont de bonnes chances d’être compétitifs une fois nivelés. »

  **Qu’est-ce que la chance d’amélioration ?** L’app simule toutes les façons dont une pièce pourrait roller lors du passage à +16 — certains jets touchent le sous-stat voulu, d’autres non — et compte combien de fois la pièce finit dans votre top N sur l’ensemble de ces futuros. Une pièce avec 68 % de chance d’amélioration finit dans le top N dans environ deux chemins simulés sur trois.

  **Règle essentielle : le seuil ne peut qu’ajouter à la protection, jamais en retirer.** Votre top-N actuel est toujours conservé, quelle que soit sa chance d’amélioration. Une pièce entièrement renforcée (+16) compte directement sa valeur actuelle figée — elle ne peut pas tomber hors de la protection parce qu’elle « n’a plus de potentiel d’amélioration ».

  **Exemple — bannières SPD, Quantité requise = 2, Par faction (rang 6 légendaire) :**

  | Bannière | SPD | Niveau | Chance d’amélioration | Standard | Seuil ≥ 50 % | Seuil ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | 0 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | 26 % | ✗ vendu | ✗ vendu | ✔ seuil ajoute |

  Les bannières de rang 6 rollent le SPD par incréments de **5 ou 6** par événement, donc les seules valeurs réalistes à l’état frais sont **5** (minimum) ou **6** (maximum). Le SPD=12 de la bannière A signifie qu’elle a reçu exactement un jet SPD bonus lors du renforcement (6 initial + 1 jet de 6). La bannière B a été entièrement nivelée sans jet SPD bonus — sa valeur est figée à 6.

  La bannière B obtient 0 % de chance d’amélioration : son SPD=6 fixe devrait perdre face à tout concurrent non nivelé dont les jets futurs pourraient le dépasser. Malgré tout, elle reste protégée car elle est dans le top-2 standard par valeur **actuelle**. La chance d’amélioration ne peut jamais retirer une pièce du top-N — seule la logique d’expansion par seuil l’utilise.

  La bannière C (SPD=5, fraîche) se trouve juste en dehors du top-2 par valeur actuelle. Ses 26 % de chance d’amélioration signifient qu’elle finirait dans le top-2 dans environ 1 chemin simulé sur 4. Avec seuil ≥ **25 %**, elle est protégée ; à seuil ≥ 50 % elle reste vendue.

  Si la bannière C avait débuté à **SPD=6**, sa chance d’amélioration monte à **68 %** — une candidate bien plus solide. Seuil ≥ **65 %** la protégerait.

  **Les bannières épiques de rang 6** ne reçoivent que **3 événements de jet SPD** (contre 4 pour les légendaires, car la mise à niveau +4 ajoute un nouveau sous-stat plutôt que de roller un existant). Les chances résultantes sont quasi identiques : SPD=6 frais → **70 %**, SPD=5 frais → **26 %**.

  **Seuils suggérés (équipement de rang 6) :**
  - **65 %** — protège les drops frais au maximum (SPD=6, ~68–70 % de chance). Bon réglage par défaut si vous voulez que les drops prometteurs survivent pendant le nivelage.
  - **25 %** — protège aussi les drops au minimum (SPD=5, ~26 % de chance). Filet plus large ; à utiliser si l’espace d’inventaire n’est pas un problème.
  - Évitez **100 %** : cela ne correspond qu’aux pièces entièrement nivelées déjà conservées par le top-N standard, donc cela n’ajoute rien au mode standard.

#### Portées de quota en un coup d’œil
Empiler les puces de portée change qui obtient sa propre quote-part. Laissez « Par règle » actif pour partager un seul pool, puis activez `Par emplacement`, `Par ensemble`, `Par faction` et `Par stat principale` pour suivre chaque mélange Slot × Set × Faction × Stat principale séparément.

| Bouton de portée | Comportement du quota | Quand l’utiliser |
| --- | --- | --- |
| `Par règle` | Un pool commun pour toute la règle. | Conserver cinq bottes SPD quels que soient les sets. |
| `Par emplacement` | Duplique la quote-part pour chaque slot. | Protéger deux anneaux, deux amulettes et deux bannières indépendamment. |
| `Par ensemble` | Duplique la quote-part pour chaque set/méta-set. | Suivre deux drops Stoneskin et deux Protection séparément. |
| `Par faction` | Duplique la quote-part pour chaque faction. | Garantir trois anneaux Merciless pour chaque faction. |
| `Par stat principale` | Duplique la quote-part pour chaque stat principale. | Séparer les réserves d’étendards ACC vs RES. |

#### Exemples concrets

| Scénario | Filtres | Quantité requise | Puces de portée | Ce que garantit l’analyse |
| --- | --- | --- | --- | --- |
| Les bottes SPD disparaissent | Slot = Bottes, Stat principale = SPD, Sets vides | `5` | `Par règle` | Au moins cinq bottes SPD survivent, peu importe le set. |
| Mélanger gants Savage et Lethal | Slot = Gants, Sets = Savage + Lethal, Stat principale = DCC% | `3` | `Par règle` | Trois gants DCC% restent, quel que soit le mix des deux sets. |
| Anneaux Merciless par faction | Slot = Anneau, Set = Merciless, Faction vide | `3` | `Par faction` | Chaque faction conserve trois de ses anneaux Merciless. |
| Anneaux PV% par faction | Slot = Anneau, Stat principale = PV%, Sets vides | `2` | `Par faction` | Deux anneaux PV% par faction restent en inventaire. |
| Accessoires essentiels par faction | Trois règles (Anneau, Amulette, Bannière), Sets/Stat principale vides | `5` | `Par faction` | Cinq anneaux, amulettes et bannières survivent pour chaque faction. |
| Séries Stoneskin/Protection par faction | Slot = Anneau/Amulette/Bannière, Sets = Stoneskin + Protection, Stat principale vide | `2` | `Par ensemble` + `Par faction` + `Par emplacement` | Chaque faction garde deux Stoneskin et deux Protection par slot d’accessoire. |
| Accessoires SPD les plus rapides | Slot = Anneau/Amulette/Bannière, Sous-stats = SPD | `5` | `Par règle` | Conserve les cinq meilleurs jets SPD sur vos accessoires (égalités incluses). |
| Bannières ACC avec SPD | Slot = Bannière, Stat principale = ACC, Sous-stats = SPD + ACC, Poids : SPD plus élevé | `3` | `Par faction` | Chaque faction garde les meilleures bannières ACC où SPD compte le plus. |

Astuce : Importez votre `.db` ou collez des objets dans le dialogue « Équipement » avant de passer en mode Protections pour fournir de vrais items à l’analyse. Cliquez sur une règle de protection pour surligner les correspondances ; passez `Filtrer` sur `Sélection` pour ne voir que ces lignes.

### Butin de donjon (Simulateur)
Ouvrez « Outils » et passez sur **Butin de donjon**. Il simule le farm de donjon avec vos règles Sellfile actuelles pour voir combien d’équipement vous garderiez par set et par niveau d’amélioration.

- Choisissez un donjon et un palier.
- Mode de simulation :
  - `Montée de niveau` : les rolls s’arrêtent dès que l’objet serait vendu, donc ça reflète le leveling réel.
  - `Instantané` : les rolls vont toujours jusqu’à +16, même si l’objet aurait été vendu avant.
- Le tableau affiche les drops conservés divisés par tous les drops de ce palier à +0 / +4 / +8 / +12 / +16.
- Cliquez sur une cellule pour le détail slot + stat principale, puis ouvrez **Chances de sous-statistiques spécifiques** pour les chances exactes et les estimations de passages.

Notes :
- Utilise vos règles actuelles Conserver/Vendre, y compris Vente finale et Conserver les uniques.
- Environ 100 000 drops par palier, avec mise à jour pendant l’exécution.
- Les taux de drop et les rolls sont simulés : considérez les chiffres comme des estimations.

### Analyse d’équipement
Ouvrez « Outils » et passez sur l'onglet **Analyse d’équipement** pour un aperçu analytique de votre équipement importé.

**Cartes KPI (ligne du haut) :** Huit cartes de pourcentage — **Taux 6★**, **Légendaire+**, **Maxé (+16)**, **Équipé**, **Verrouillé au coffre**, **Chaos'd**, **Glyphed**, **Éveillé** — chacune avec une infobulle.

**Donuts à filtre croisé :** Six graphiques — **Emplacements**, **Rang**, **Rareté**, **Résultat**, **Source**, **Niveau** — se mettent à jour mutuellement lors d'un clic.
- Cliquez sur un segment pour l'ajouter comme filtre de cette dimension ; chaque autre graphique se restreint immédiatement à l'équipement correspondant. Chaque graphique exclut sa propre dimension pour toujours afficher sa plage complète.
- Double-cliquez sur un segment du donut **Slots** pour sélectionner tout un groupe d'un coup : toute pièce d'armure (Arme, Casque, Bouclier, Gants, Plastron, Bottes) sélectionne les six emplacements d'armure ; tout accessoire (Anneau, Amulette, Bannière) sélectionne les trois.
- Les donuts **Emplacements** et **Source** affichent des icônes de catégorie. Le donut **Niveau** libelle chaque arc avec son texte de niveau.


**Treemap des Sets :** Affichée sous les donuts. Chaque tuile représente un set d'équipement ; la surface de la tuile est proportionnelle au nombre d'objets. L'arrière-plan de la tuile est divisé de gauche à droite en bandes de couleur par résultat (Vendre / Protégé / Garder / Aucune correspondance). Cliquez sur une tuile pour ajouter ce set comme filtre croisé.

**Puces de filtre :** Les sélections actives pour chaque dimension apparaissent sous forme de puces sous les donuts ; cliquez l'icône de suppression sur une puce pour retirer uniquement ce filtre. Les sélections de stat principale apparaissent aussi en puces. Le bouton **Effacer les filtres** réinitialise toutes les dimensions en même temps.

**Barre Stats principales :** Indique la fréquence d'apparition de chaque stat principale dans l'équipement filtré. Cliquez une barre pour zoomer — le graphique de fréquence des sous-stats affiche alors uniquement les sous-stats provenant de l'équipement ayant cette stat principale. Cliquez à nouveau pour désélectionner.

**Radar Fréquence des sous-stats :** Indique la fréquence d'apparition de chaque sous-stat dans l'équipement filtré (et éventuellement limité à une stat principale) sous forme de graphique radar. Cliquez sur une marque d'axe pour la sélectionner comme pivot de co-occurrence — le radar se restreint alors aux pièces contenant tous les sous-stats sélectionnés à la fois (jusqu'à 4 pivots). Les pivots actifs apparaissent en puces sous le graphique ; × en retire un, **Effacer les filtres** les retire tous.

**Carte de chaleur Slot × Stat principale :** Nombre d'objets par slot (colonnes) × stat principale (lignes). Cliquez sur un en-tête de colonne ou une cellule pour filtrer par ce slot.

**Onglet Statistiques des champions :** Totaux de sous-stats cumulés sur les pièces équipées par champion. Filtrez par emplacement (**Tous** / **Collection** / **Coffre**), activez **Entièrement équipé** uniquement, et incluez ou excluez les glyphes. Affiche les séries Min/Moy/Médiane/Max.

**Équipement des champions :** Couverture d’équipement par champion en deux tableaux compacts (**Collection** / **Coffre**). Chaque ligne affiche une grille 3×3 (rempli = équipé, contour = vide, pointillé = verrouillé tant que le champion n’a pas ascensionné). Cliquez sur un emplacement rempli pour sélectionner cette pièce — la sélection est partagée avec l’Inspecteur d’équipement. Activez **Simuler vente** pour colorer en rouge les emplacements dont la pièce serait vendue et les compter comme manquants, ou **Afficher les complets** pour lister également les champions entièrement équipés.

**Boutons :**
- **Copier l'instantané :** Rend la vue analytique complète en PNG et la copie dans le presse-papiers. Note : l’Équipement des champions n’est pas inclus dans l’instantané.
- **Appliquer à l'Inspecteur d'équipement :** Envoie le filtre croisé actif dans le filtre de liste de l'Inspecteur d'équipement (visible uniquement quand un filtre est actif).

### Gestion des recettes
- Les recettes sauvegardées apparaissent sous forme de puces sous le builder. Clic gauche pour sélectionner ; clic droit pour dupliquer, déplacer, copier ou supprimer.
- « Delete Recettes » supprime toutes les recettes (avec confirmation).
- Survol lié : Survoler une puce surligne toutes les lignes correspondantes dans l’aperçu et inversement.
- Clic lié : Cliquer une ligne de la table sélectionne la recette d’origine (les lignes provenant du HSF de base n’affectent pas la sélection).
- Copie de secours : Si l’accès au presse-papiers échoue, un dialogue s’ouvre avec le texte présélectionné pour copie manuelle.
- Bascule Recettes activées/désactivées : le bouton dans l’en-tête du builder désactive globalement toutes les recettes sans les supprimer, mettant en pause la pipeline d’aperçu — utile pour vérifier rapidement un export avec Protections seulement ou confirmer ce que la Vente finale produit seule.

### Aperçu du Sellfile (Règles & Inspecteur d’équipement)
- L’en-tête de l’aperçu regroupe l’interrupteur `Règles`/`Inspecteur d’équipement`, le bouton « Outils » et « Charger Sellfile RSL Helper » pour que vous sachiez toujours où changer de table ou ouvrir le dialogue « Équipement ».
- Vue `Règles` (par défaut) : affiche toutes les règles qui seront exportées, y compris les lignes provenant d’un éventuel `.hsf` de base. Les compteurs restent sur Conserver vs Vendre, la rangée de filtres conserve les puces Peu importe/Seulement (`Any/Only`) pour Slots/Rang/Rareté/Niveau et expose désormais les deux boutons `Recettes` côte à côte : `Recettes aperçu` décide si les puces restent visibles sous les filtres actuels et le `Filtre recettes` se comporte ici comme un simple bouton Activé/Désactivé qui masque les lignes du Sellfile hors de votre sélection (tout en gardant le filtre prêt pour l’Inspecteur d’équipement).
- Vue `Inspecteur d’équipement` : bascule la table sur la liste importée afin d’examiner les objets importés ou créés sans rouvrir le dialogue Outils. Les compteurs passent en Conserver/Vendre/Portée/Sans règle selon la règle « la première recette correspondante l’emporte », et la rangée de filtres conserve les deux boutons `Recettes` (`Recettes aperçu` + `Filtre recettes`). Le premier continue de gérer la visibilité des puces, tandis que le `Filtre recettes` applique le tri-état (`Off` → `Première` → `Par correspondance`) pour isoler les lignes de l’Inspecteur d’équipement et continue de restreindre les règles correspondantes lorsque vous revenez sur `Règles`. L’import d’un `.db` passe automatiquement dans cette vue, mais vous pouvez revenir aux règles quand vous le souhaitez.
- Le bouton « Charger Sellfile RSL Helper » se comporte exactement comme le glisser-déposer : `.sfc` remplace l’état du builder, `.hsf` ajoute un fichier de base optionnel et `.db` injecte des objets directement dans l’Inspecteur d’équipement (sans toucher aux recettes). Le bouton « Vider » déconnecte l’éventuel `.hsf` de base.
- L’icône palette ouvre la gestion des couleurs pour ajuster texte et fond des étiquettes de sous-stats.
- En vue Règles, les colonnes « Idx » et « Recette » restent en place (vides pour les lignes du fichier de base). En vue Inspecteur d’équipement, le même espace affiche slot/set, stats de l’objet et la puce de la première recette qui a correspondu pour visualiser immédiatement ce qui arriverait à chaque artefact.

### Contrôles de l’aperçu
- Gérer les couleurs : cliquez sur l’icône palette au-dessus de la table pour personnaliser les couleurs, puis utilisez « Restaurer par défaut » pour revenir aux recommandations.
- Filtres : pressez `Ctrl+F` (`Cmd+F` sur macOS) pour ouvrir instantanément le panneau et placer le curseur dans la recherche de recettes. Clic droit sur un en-tête de section (ou `Ctrl`/`Cmd` + clic sur son chevron) pour replier ou déployer toutes les sections d’un coup. `Recettes aperçu` masque les puces de recettes qui ne correspondent pas au filtre actif pour garder l’aperçu lisible. `Filtre recettes` décide quelles recettes restent autorisées dans la table : simple bascule Activé/Désactivé en vue `Règles`, puis cycle `Off` → `Première` → `Par correspondance` quand l’`Inspecteur d’équipement` est actif pour contrôler les lignes de l’Inspecteur.
- Menu des colonnes (clic droit sur l’en-tête) :
  - Réinitialiser les colonnes : restaure colonnes et largeurs par défaut.
  - Ajuster la largeur : adapte les colonnes à la fenêtre.
  - Autoriser les lignes multilignes : active le retour à la ligne (utile pour les sous-stats).
  - Afficher/Masquer : cases à cocher par colonne.
- Réordonner : faites glisser un en-tête horizontalement.
- Redimensionner : faites glisser le bord droit de l’en-tête.
- Comportement du clic : cliquer une ligne sélectionne la recette correspondante (sans défilement automatique). Cliquer une puce de recette fait défiler jusqu’à la première ligne associée.

### Aperçu de l’Inspecteur d’équipement
- Cliquez sur « Outils » dans l’en-tête de l’aperçu pour ouvrir le dialogue « Équipement ». Créez un équipement d’exemple. Les objets se synchronisent aussitôt avec l’aperçu, donc fermer le dialogue ne vide pas la grille de l’Inspecteur d’équipement.
- Connectez RSL Helper pour une synchronisation en direct (le bouton Connect dans l’en-tête de l’aperçu) ou déposez un fichier `.db` dans l’app ou utilisez « Charger Sellfile RSL Helper ».- Chaque ligne de l’Inspecteur d’équipement affiche slot, set, niveau, stat principale, sous-stats (avec glyphes et jets), la source (inventaire vs boîte de réception) et des puces Conserver/Vendre avec la première recette/règle correspondante. Les règles désactivées ne correspondent jamais, donc « Aucune correspondance » signale l’équipement que la Sellfile laisserait intact.
- Les compteurs de l’en-tête affichent les totaux Conserver/Vendre/Portée/Sans règle. Les quatre boutons du filtre de résultat — **Conserver**, **Vendre**, **Portée** et **Sans règle** — fonctionnent comme des bascules indépendantes : activez n’importe quelle combinaison pour affiner la liste. **Portée** atténue (mais garde visibles) les objets qui partagent le même set+emplacement qu’une pièce que vos règles vendraient, afin de comparer un candidat avec ses concurrents en une seule vue sans avoir à faire deux passes de filtre. Lorsqu'une ou plusieurs **Sources** sont également sélectionnées, elles servent de référence — seuls les objets estampillés Vendre des sources sélectionnées deviennent des éléments principaux, tandis que les compagnons sont trouvés dans *toutes* les sources, ce qui vous permet de voir chaque exemplaire de la pièce quel que soit son emplacement. **Sans règle** affiche l’équipement qu’aucune règle ne touche — utile pour repérer les lacunes de vos recettes. Combinez avec le sélecteur `Première`/`Par correspondance` des Recettes pour vous concentrer sur les cas limites avant l’export.
- Utilisez l’interrupteur d’aperçu pour alterner entre les tables Règles et Inspecteur d’équipement sans rouvrir le dialogue Outils — idéal pour comparer les lignes générées et l’équipement qui les a déclenchées.

### Export
- « Exporter Sellfile RSL Helper fusionnée » apparaît si un fichier de base est chargé ; sinon « Exporter Sellfile RSL Helper ».
- Utilisez « Enregistrer des recettes » et « Charger des recettes » pour sauvegarder votre travail.
- Nom par défaut du fichier exporté : `Sellfile_AAAA MM JJ_HHMM.hsf`.

## Exemples

Les exemples supposent des objectifs de sous-stats 6★ par unité de jet : SPD=5, TRC=5, DCC=5.

Tôt vs Tard
- Tôt : les seuils reflètent les jets déjà obtenus. Avec ★ + somme minimale, seules les divisions minimales par palier sont montrées (liste stable). Sinon, Tôt énumère le progrès possible jusqu’à satisfaction des conditions puis se stabilise sur tes objectifs par stat (sauf exigence Σ plus élevée).
- Tard : n’exige que ce qui doit être présent maintenant pour que l’objectif +16 reste atteignable. Avec ★ + somme minimale, Tard répète ces divisions aux premiers paliers et à +16. Avec objectifs par stat, Tard émet les bornes minimales requises à chaque niveau.

Exemple : Tôt (2 sous-stats) — SPD min=2, TRC min=1 (niveaux 0..16)
- +0 : SPD ≥ 5, TRC ≥ 5
- +4 : [10,5] et [5,10]
- +8 : [15,5], [10,10], [5,15]
- +12/+16 : [15,10]

Exemple : Tard (2 sous-stats) — SPD min=2, TRC min=1 (niveaux 0..16)
- +0/+4 : [5,5]
- +8 : [10,5] ou [5,10]
- +12 : [15,5] ou [10,10]
- +16 : [15,10]

Exemple : Tôt (3 sous-stats) — SPD min=2, TRC min=1, DCC libre, Obligatoires=3
- +0 : [SPD, TRC, DCC] ≥ [5,5,5]
- +4 : divisions à un jet : [10,5,5], [5,10,5], [5,5,10]
- +8 : divisions à deux jets (limites supérieures respectées)
- +12/+16 : [15,10,5]

Exemple : Tard (3 sous-stats) — SPD min=2, TRC min=1, DCC libre, Obligatoires=3
- +0/+4 : [5,5,5]
- +8 : [10,5,5] ou [5,10,5]
- +12 : [15,5,5] ou [10,10,5]
- +16 : [15,10,5]

Astuce : Utilisez les limites supérieures de jets pour interdire les améliorations sur un stat. Depuis ★, clic droit → limite supérieure et fixez-la à 0. Ainsi DCC reste à la valeur de base tandis que SPD/TRC reçoivent les jets.

Exemple : Verrouiller un stat, en exiger deux
- Sous-stats : SPD, PV, ATQ. Cliquez SPD puis le badge cadenas (🔒) pour le verrouiller.
- Sous-stats obligatoires = 2.
- Résultat : SPD+PV et SPD+ATQ apparaissent. PV+ATQ sans SPD n’est jamais généré (les verrouillés sont toujours inclus).

Exemple : Concentrer les jets sur 3 stats et bloquer le 4ᵉ
- Objectif : Garder les objets avec SPD, TRC, DCC et l’un de PV%/ATQ%/DEF%, sans jets sur ce quatrième stat.
- Sous-stats : SPD, TRC, DCC, PV%, ATQ%, DEF%.
- Sous-stats obligatoires = 4.
- Indicateurs :
  - Depuis ★, clic gauche (minima) : définissez SPD/TRC/DCC sur les minima souhaités (ex. 1 chacun).
  - Depuis ★, clic droit (limite supérieure) : fixez PV%/ATQ%/DEF% à limite supérieure 0.
- Résultat : le quatrième stat alterne entre les trois mais ne reçoit aucun jet ; SPD/TRC/DCC gagnent les améliorations.

Exemple : Tôt avec joker (sélection uniquement)
- Sous-stats : SPD et PRÉ.
- Indicateurs : SPD min = 2 ; PRÉ = ★.
- Sous-stats obligatoires : Auto (2).
- Niveaux : +0 à +16.
- Effet : Tôt liste les objets pouvant atteindre SPD(2) à +16 (lignes où SPD ou PRÉ a reçu un jet). Dès que deux jets SPD sont possibles, la ligne minimale apparaît.

Exemple : Somme des jets avec jokers (2 sous-stats)
- Sous-stats : SPD et PRÉ, tous deux sur ★.
- Sous-stats obligatoires : 2. Jets minimum : 1.
- Tôt :
  - +4/+8/+12/+16 : deux lignes — SPD ≥ 10, PRÉ ≥ 9 et SPD ≥ 5, PRÉ ≥ 18 (divisions minimales ; liste stable).
- Tard :
  - +0/+4/+8/+12 : seulement les lignes de base (rien d’exigé en plus) ; +16 : les deux lignes ci-dessus. Avec un minimum plus élevé, Tard impose les divisions nécessaires aux paliers adéquats (ex. minimum 2 → +12 montre les divisions à un jet, +16 celles à deux jets).

#### Scénarios du builder en un coup d’œil

| Scénario | Paramétrage | Ce que le builder émet |
| --- | --- | --- |
| Tôt (2 sous-stats) | SPD min = 2, TRC min = 1, Niveaux +0..+16 | `+0 :` SPD ≥ 5, TRC ≥ 5<br>`+4 :` [10,5] et [5,10]<br>`+8 :` [15,5], [10,10], [5,15]<br>`+12/+16 :` [15,10] |
| Tard (2 sous-stats) | Identique ci-dessus | `+0/+4 :` [5,5]<br>`+8 :` [10,5] ou [5,10]<br>`+12 :` [15,5] ou [10,10]<br>`+16 :` [15,10] |
| Tôt (3 sous-stats) | SPD min = 2, TRC min = 1, DCC sélectionné, Obligatoires = 3 | `+0 :` [SPD, TRC, DCC] ≥ [5,5,5]<br>`+4 :` permutations à un jet (10/5/5, 5/10/5, 5/5/10)<br>`+8 :` permutations à deux jets (limites supérieures respectées)<br>`+12/+16 :` [15,10,5] |
| Tard (3 sous-stats) | Même stats que ci-dessus | `+0/+4 :` [5,5,5]<br>`+8 :` [10,5,5] ou [5,10,5]<br>`+12 :` [15,5,5] ou [10,10,5]<br>`+16 :` [15,10,5] |
| Verrouiller un stat, en exiger deux | Sous-stats SPD/PV/ATQ ; SPD verrouillé (🔒) ; Sous-stats requis = 2 | Le builder émet SPD+PV et SPD+ATQ ; PV+ATQ est exclu car SPD verrouillé doit apparaître. |
| Concentrer les jets sur 3 stats et figer le slot flexible | Sous-stats SPD/TRC/DCC/PV%/ATQ%/DEF% ; Sous-stats requis = 4 ; SPD/TRC/DCC Min jet = 1 ; PV%/ATQ%/DEF% Limite sup = 0 | SPD/TRC/DCC reçoivent toujours les jets tandis que le 4ᵉ stat (PV%/ATQ%/DEF%) reste à la valeur de base. |
| Tôt avec un joker | Sous-stats SPD (Min = 2) et PRÉ (★ joker) ; Sous-stats requis = Auto ; Niveaux +0..+16 | Les jalons Tôt mettent en évidence toute pièce qui peut encore atteindre SPD(2) à +16 ; dès que deux jets SPD sont possibles, la ligne SPD ≥ apparaît. |
| Somme des jets avec jokers | Sous-stats SPD et PRÉ sur ★ ; Sous-stats requis = 2 ; Jets minimum = 1 | **Tôt :** +4/+8/+12/+16 montrent les deux répartitions minimales (SPD ≥ 10 & PRÉ ≥ 9, ou SPD ≥ 5 & PRÉ ≥ 18).<br>**Tard :** +0/+4/+8/+12 restent sur les lignes de base ; +16 affiche ces deux répartitions. Des cibles plus élevées obligent Tard à réclamer ces répartitions plus tôt. |

## Notes pour les contributeurs

- Traductions : Les archives de release contiennent des modèles de localisation dans `i18n/` (ex. `i18n/fr-FR.l10n.json`).
- Modifier & tester : Ouvrez l’app et déposez votre `*.l10n.json` modifié pour l’appliquer immédiatement à la session en cours (aucune installation nécessaire ni possible).
- Envoyer des corrections : Transmettez le JSON mis à jour par message Discord. Ne changez pas les clés ; les clés manquantes repassent en anglais.
- Langues intégrées : Toutes les langues livrées sont compilées dans l’unique fichier HTML, l’app fonctionne donc entièrement hors ligne. Vos corrections seront intégrées à la prochaine version.
- `Stream-Helper-DB-to-Creator.bat` démarre le DB watcher et diffuse la base RSL Helper par défaut dans Sellfile Creator pour vérifier les recettes en direct plus facilement.

## Remerciements

Merci beaucoup à **[STBL] Nasgor** pour ses contributions inestimables,  
à **[SP] Panda** pour ses Sellfiles,  
à **KruYseN** pour ses vidéos de nettoyage d’équipement,  
et bien sûr à **Farbstoff** pour RSL Helper !

## Auteur
Réalisé par [STBL] Nusi㊷  
Localisation par AI

© Nusi㊷ - 2026
