# RSL Helper Sellfile Creator

Construisez, prévisualisez et exportez des règles de vente pour RSL Helper via une interface simple.

> Projet de fans indépendant. Aucune affiliation avec Plarium, Raid: Shadow Legends ou RSL Helper. Toutes les marques citées appartiennent à leurs propriétaires.

## Fonctionnalités
- Construire et enregistrer des règles : créez des configs et conservez une bibliothèque réutilisable.
- Interrupteur d’aperçu du Sellfile : basculez depuis l’en-tête entre la table Règles et la table du Testeur de règles. Les compteurs/puces d’état s’adaptent (Conserver/Vendre pour les règles, Correspondance/Aucune correspondance pour le tester) et les filtres suivent le mode choisi.
- Glisser-déposer ou bouton Charger : déposez `.hsfc`, `.hsf` ou `.db` où vous voulez (l’overlay confirme) ou cliquez sur « Charger Sellfile RSL Helper ». Les deux options font exactement la même chose : `.hsfc` remplace votre builder, `.hsf` ajoute une Sellfile de base optionnelle et `.db` alimente directement la file du Testeur de règles sans toucher vos configs.
- Méta-sets : nommez des groupes de sets (ex. Vitesse + Perception) et réutilisez-les dans plusieurs règles.
- Export en un clic : exportez un fichier HSF (Sellfile RSL Helper) prêt à être chargé dans RSL Helper.
- Aperçu Testeur de règles + dialogue « Équipement... » : créez un équipement d’exemple, collez des lignes ou glissez votre base de données RSL Helper (souvent `%APPDATA%\\RslHelper\\Config`) dans le dialogue. Laissez le dialogue fermé et utilisez l’interrupteur d’aperçu pour garder cet équipement visible pendant que vous le comparez à vos règles.
- Onglet « Conserver les uniques » : définissez les combinaisons que vous ne voulez jamais perdre. Dès que vos configs plus vos règles de vente actuellement actives supprimeraient toutes les copies, l’analyse génère automatiquement des règles de conservation.
- Dialogue de restauration Autosave : lorsqu’un Autosave est détecté, choisissez précisément quoi recharger — configs, méta-sets, Objectifs de sous-stats, reste de Vente finale, note épinglée, état du panneau de filtres et même les importations du Testeur de règles.
- Copier le dossier RSL Helper : le bandeau de l’aperçu expose un bouton presse-papiers qui copie `%APPDATA%\\RslHelper\\Config` pour coller le chemin dans l’Explorateur avant de faire glisser la `.db` dans Sellfile Creator.

## Mode d’emploi

### Fichier de configs
- HSFC (`.hsfc`) : fichier projet spécifique à l’application. Considérez-le comme une sauvegarde que vous pouvez charger ou partager. RSL Helper ne lit pas directement HSFC.
- HSF (`.hsf`) : la Sellfile consommée par RSL Helper. Exportez-la ici puis chargez-la dans RSL Helper.
- Nom par défaut lors de l’enregistrement : `SellfileCreatorRules_AAAA MM JJ_HHMM.hsfc`.

### Configs Builder
- Renseignez les champs du Configs Builder et attribuez un nom clair à votre config.
- Cliquez sur « Ajouter comme nouvelle config » pour l’enregistrer. Sélectionnez ensuite la config dans la liste sous le builder pour l’éditer, puis validez avec « Mettre à jour la config sélectionnée ».
- Charger/Enregistrer : utilisez « Charger des configs » et « Enregistrer des configs » pour réutiliser vos règles. Ces actions conservent tout ce qu’il faut pour reconstruire l’aperçu.
- Menus Réinitialiser/Insérer/Appliquer : clic droit sur Réinitialiser, Insérer comme config ou Appliquer à la config pour ouvrir le menu partagé. Sauvegardez l’état actuel du builder comme modèle par défaut, retournez aux réglages d’usine, activez Réinitialisation auto après insertion (vide immédiatement le builder après l’insertion d’une config) ou activez Application auto à la config sélectionnée (pousse les modifications vers la config en surbrillance automatiquement après ~400 ms d’inactivité). Réinitialisation auto et Application auto ne peuvent pas coexister : activer l’une désactive l’autre, et ces préférences persistent entre les sessions.
- Note : cliquez sur « Ajouter une note… » (ou « Modifier la note… ») pour joindre une note au fichier de configs. Lors du chargement d’un fichier contenant une note, celle-ci s’affiche automatiquement. Utilisez `<!-- configs:1,0 -->` pour insérer des puces de configs précises (0 prend la suivante). Utilisez `<!-- configs-re:"speed" -->` pour afficher toutes les configs dont le nom correspond au motif (insensible à la casse).
- Restauration Autosave : au lancement, le dialogue liste chaque section sauvegardée avec sa propre case. Restaurez uniquement ce dont vous avez besoin — configs (y compris la puce sélectionnée), méta-sets, Objectifs de sous-stats, reste de Vente finale, note épinglée, panneau de filtres (état ouvert, puces, sections repliées) et importations du Testeur de règles. Laissez une case décochée pour conserver votre travail. Autosave mémorise également quels interrupteurs de Vente finale (Artefacts, Accessoires et plages de niveau) étaient actifs, donc rouvrir le dialogue reflète exactement ce que vous avez exporté la dernière fois.

### Structure du builder (du haut vers le bas)
- Action & Activé : Déterminez ce qui se passe lorsque l’objet correspond.
  - `Conserver` marque l’objet comme Conserver ; RSL Helper le laisse intact.
  - `Vendre` marque l’objet comme Vendre ; RSL Helper le place dans la file de vente.
  - L’interrupteur « Activé dans le Sellfile » décide si les lignes exportées restent actives. Les configs désactivées sont exportées avec Use = false (affichées barrées dans l’aperçu) ; activez « Ignorer les règles désactivées lors de l\'export » dans le menu d’export si vous préférez les exclure.
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
- Ouvrez le dialogue « Objectifs de sous-stats… » dans l’angle supérieur droit du builder.
- Ces objectifs sont globaux : ils s’appliquent à toutes les configs.
- Ils déterminent les seuils par plage de niveau (0–3, 4–7, 8–11, 12–15, 16) et servent de repli dans la grille des Objectifs de jets.
- « Réinitialiser » restaure les objectifs recommandés.

### Méta-sets
- Cliquez sur « Gérer les méta-sets… » pour ouvrir le dialogue.
  - Créez ou renommez des méta-sets et choisissez les sets qu’ils contiennent. L’interface reprend la recherche du sélecteur de sets.
  - Des méta-sets de démarrage sont fournis ; éditez-les ou supprimez-les à tout moment.
  - « Réinitialiser » propose des options sûres lorsqu’un méta-set est en cours d’usage (supprimer, remplacer par des sets explicites ou par un autre méta-set).

### Vente finale
- Bascule à côté du bouton Export pour ajouter des règles de vente destinées aux objets restants. Activée par défaut.
- Choisissez si cela concerne Artefacts et/ou Accessoires et quels intervalles de niveau (0–3, 4–7, 8–11, 12–15, 16). Par défaut : 0–15 pour éviter la vente de pièces +16.
- Sans vente finale, RSL Helper conserve tout ce qui ne correspond à aucune règle. Une vente n’a lieu que si une règle explicite le demande.
- Avec vente finale active, les règles générées incluent tous les sets connus. L’aperçu indique « Tous les sets connus » pour alléger la vue, mais le fichier exporté liste chacun d’eux.

### Conserver les uniques
- Ouvrez le dialogue Vente finale et passez sur l’onglet « Conserver les uniques » pour marquer les combinaisons que vous refusez de vendre. Activez « Conserver les uniques » pour commencer à les éditer.
- Chaque règle vous permet de choisir slot, sets ou méta-sets, rangs, raretés, stats principales et, pour les accessoires, factions. Laisser un sélecteur vide signifie « n’importe lequel ».
- Une règle par défaut est déjà fournie pour les anneaux, amulettes et bannières 5★/6★ couvrant tous les sets accessoires 1–9 et les sets pièce unique, avec `Par emplacement`, `Par ensemble`, `Par faction` et `Par stat principale` activés pour conserver au moins une pièce de chaque combinaison.
- Une règle d’aide (désactivée) couvre les pièces d’arme/armure (arme, casque, bouclier, gants, plastron, bottes) des familles stun/toxic/daze/cursed/provoke/destroy en 5★/6★. Elle active `Par emplacement` et `Par ensemble` pour garder la logique prête si ces sets rares requièrent une protection supplémentaire.
- `≥ Quantité requise` se trouve juste à côté d'un petit groupe de boutons. « Par règle » garde une seule quote-part, et les boutons « Par emplacement », « Par ensemble », « Par faction » et « Par stat principale » peuvent être combinés pour multiplier la quote-part selon chaque mélange concerné (les désactiver tous les quatre ramène automatiquement le mode « Par règle »).
- Le compteur « `{have} existants / Conserver {keep}` » reflète exactement ce que détaille l’infobulle : **Existants** compte les pièces déjà protégées par les configs, la Vente finale ou les règles Conserver les uniques actives ; **Conserver** reprend le quota défini via `≥ Quantité requise`. Seuls les objets correspondant à la règle alimentent ces totaux.
- Le sélecteur « `Filtrer : {mode}` » (au-dessus de la grille) propose `Tous` et `Sélection`. `Sélection` affiche uniquement les entrées associées à la règle Conserver les uniques actuellement surlignée ; tant qu’aucune règle n’est choisie, le mode reste aligné sur `Tous`.
- L’analyse n’ajoute des lignes supplémentaires que lorsque chaque objet correspondant serait vendu autrement. Si vos configs habituelles sauvent déjà assez de pièces, la règle affiche « Couvert ailleurs » et rien n’est ajouté à l’export.

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

| Scénario | Filtres | Puces de portée | Ce que garantit l’analyse |
| --- | --- | --- | --- |
| Les bottes SPD disparaissent | Slot = Bottes, Stat principale = SPD, Sets vides | `Par règle` | Au moins cinq bottes SPD survivent, peu importe le set. |
| Mélanger gants Savage et Lethal | Slot = Gants, Sets = Savage + Lethal, Stat principale = DCC% | `Par règle` | Trois gants DCC% restent, quel que soit le mix des deux sets. |
| Anneaux Merciless par faction | Slot = Anneau, Set = Merciless, Faction vide | `Par faction` | Chaque faction conserve trois de ses anneaux Merciless. |
| Anneaux PV% par faction | Slot = Anneau, Stat principale = PV%, Sets vides | `Par faction` | Deux anneaux PV% par faction restent en inventaire. |
| Accessoires essentiels par faction | Trois règles (Anneau, Amulette, Bannière), Sets/Stat principale vides, `≥ Quantité requise = 5` | `Par faction` | Cinq anneaux, amulettes et bannières survivent pour chaque faction. |
| Séries Stoneskin/Protection par faction | Slot = Anneau/Amulette/Bannière, Sets = Stoneskin + Protection, Stat principale vide | `Par ensemble` + `Par faction` | Chaque faction garde deux Stoneskin et deux Protection par slot d’accessoire. |

Astuce : Importez votre `.db` ou collez des objets dans le Testeur de règles avant d’ouvrir l’onglet pour fournir de vrais items à l’analyse. Si une règle affiche « Il manque 2 », cliquez dessus : le Testeur de règles met en évidence ces objets et révèle quelles factions ou quels sets ont encore besoin d’aide.

### Gestion des configs
- Les configs sauvegardées apparaissent sous forme de puces sous le builder. Clic gauche pour sélectionner ; clic droit pour dupliquer, déplacer, copier ou supprimer.
- « Delete Configs » supprime toutes les configs (avec confirmation).
- Survol lié : Survoler une puce surligne toutes les lignes correspondantes dans l’aperçu et inversement.
- Clic lié : Cliquer une ligne de la table sélectionne la config d’origine (les lignes provenant du HSF de base n’affectent pas la sélection).
- Copie de secours : Si l’accès au presse-papiers échoue, un dialogue s’ouvre avec le texte présélectionné pour copie manuelle.

### Aperçu du Sellfile (Règles & Testeur de règles)
- L’en-tête de l’aperçu regroupe l’interrupteur `Règles`/`Testeur de règles`, le bouton « Équipement... » et « Charger Sellfile RSL Helper » pour que vous sachiez toujours où changer de table ou ouvrir le dialogue du Testeur de règles.
- Vue `Règles` (par défaut) : affiche toutes les règles qui seront exportées, y compris les lignes provenant d’un éventuel `.hsf` de base. Les compteurs restent sur Conserver vs Vendre, la rangée de filtres conserve les puces Peu importe/Seulement (`Any/Only`) pour Slots/Rang/Rareté/Niveau et expose désormais les deux boutons `Configs` côte à côte : `Configs aperçu` décide si les puces restent visibles sous les filtres actuels et le `Filtre configs` se comporte ici comme un simple bouton Activé/Désactivé qui masque les lignes du Sellfile hors de votre sélection (tout en gardant le filtre prêt pour le tester).
- Vue `Testeur de règles` : bascule la table sur la liste importée du tester afin d’examiner les objets importés ou créés sans rouvrir le dialogue. Les compteurs passent en Correspondance vs Aucune correspondance (ainsi que Conserver/Vendre) selon la règle « la première config correspondante l’emporte », et la rangée de filtres conserve les deux boutons `Configs` (`Configs aperçu` + `Filtre configs`). Le premier continue de gérer la visibilité des puces, tandis que le `Filtre configs` applique le tri-état (`Off` → `Première` → `N’importe`) pour isoler les lignes du Testeur et continue de restreindre les règles correspondantes lorsque vous revenez sur `Règles`. Un filtre de résultat spécifique (Conserver/Vendre vs Correspondance/Aucune correspondance) s’y ajoute, ce qui permet d’isoler les objets frappés d’abord ou ailleurs par votre sélection sans masquer les puces. L’import d’un `.db` passe automatiquement dans cette vue, mais vous pouvez revenir aux règles quand vous le souhaitez.
- Le bouton « Charger Sellfile RSL Helper » se comporte exactement comme le glisser-déposer : `.hsfc` remplace l’état du builder, `.hsf` ajoute un fichier de base optionnel et `.db` injecte des objets directement dans l’aperçu du Testeur de règles (sans toucher aux configs). Le bouton « Vider » déconnecte l’éventuel `.hsf` de base.
- L’icône palette ouvre la gestion des couleurs pour ajuster texte et fond des étiquettes de sous-stats.
- En vue Règles, les colonnes « Idx » et « Cfg » restent en place (vides pour les lignes du fichier de base). En vue Testeur de règles, le même espace affiche slot/set, stats de l’objet et la puce de la première config qui a correspondu pour visualiser immédiatement ce qui arriverait à chaque artefact.

### Contrôles de l’aperçu
- Gérer les couleurs : cliquez sur l’icône palette au-dessus de la table pour personnaliser les couleurs, puis utilisez « Restaurer par défaut » pour revenir aux recommandations.
- Filtres : pressez `Ctrl+F` (`Cmd+F` sur macOS) pour ouvrir instantanément le panneau et placer le curseur dans la recherche de configs. Clic droit sur un en-tête de section (ou `Ctrl`/`Cmd` + clic sur son chevron) pour replier ou déployer toutes les sections d’un coup. `Configs aperçu` masque les puces de configs qui ne correspondent pas au filtre actif pour garder l’aperçu lisible. `Filtre configs` décide quelles configs restent autorisées dans la table : simple bascule Activé/Désactivé en vue `Règles`, puis cycle `Off` → `Première` → `N’importe` quand l’aperçu du `Testeur de règles` est actif pour contrôler les lignes du tester.
- Menu des colonnes (clic droit sur l’en-tête) :
  - Réinitialiser les colonnes : restaure colonnes et largeurs par défaut.
  - Ajuster la largeur : adapte les colonnes à la fenêtre.
  - Autoriser les lignes multilignes : active le retour à la ligne (utile pour les sous-stats).
  - Afficher/Masquer : cases à cocher par colonne.
- Réordonner : faites glisser un en-tête horizontalement.
- Redimensionner : faites glisser le bord droit de l’en-tête.
- Comportement du clic : cliquer une ligne sélectionne la config correspondante (sans défilement automatique). Cliquer une puce de config fait défiler jusqu’à la première ligne associée.

### Aperçu du Testeur de règles
- Cliquez sur « Équipement... » dans l’en-tête de l’aperçu pour ouvrir le dialogue du Testeur de règles. Créez un équipement d’exemple ou collez des lignes (JSON/texte). Les objets se synchronisent aussitôt avec l’aperçu, donc fermer le dialogue ne vide pas la grille.
- Importez votre base de données d’équipement RSL Helper en déposant des fichiers `.db` dans l’app ou via « Charger Sellfile RSL Helper » (même comportement). Ces imports ajoutent des milliers d’artefacts (et les pièces de la boîte de réception), basculent l’aperçu sur la table du tester et laissent le builder ainsi que l’état d’export inchangés.
- Chaque ligne du tester affiche slot, set, niveau, stat principale, sous-stats (avec glyphes et jets), la source (inventaire vs boîte de réception) et des puces Conserver/Vendre avec la première config/règle correspondante. Les règles désactivées ne correspondent jamais, donc « Aucune correspondance » signale l’équipement que la Sellfile laisserait intact.
- Les compteurs de l’en-tête passent sur Correspondance vs Aucune correspondance plus Conserver/Vendre. Combinez ces totaux avec les filtres du tester (résultat Conserver/Vendre, Correspondance/Aucune correspondance et `Configs testeur` en `Off`/`Première`/`N’importe`) pour analyser les cas limites avant l’export.
- Utilisez l’interrupteur d’aperçu pour alterner entre les tables Règles et Testeur de règles sans rouvrir le dialogue — idéal pour comparer les lignes générées et l’équipement qui les a déclenchées.

### Export
- « Exporter Sellfile RSL Helper fusionnée » apparaît si un fichier de base est chargé ; sinon « Exporter Sellfile RSL Helper ».
- Utilisez « Enregistrer des configs » et « Charger des configs » pour sauvegarder votre travail.
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
- Surveiller la base RSL Helper : lancez `scripts/run-sample-server.ps1 -WatchGearDb` (ou `-GearDbPath <fichier>`) pour observer `%APPDATA%\\RslHelper\\Config`. Chaque mise à jour de la `.db` est injectée dans le Testeur de règles lancé par le script, et s’il existe plusieurs bases, l’outil vous demande laquelle suivre.
- Lanceur en double-clic : `Stream-Helper-DB-to-Creator.bat` démarre le serveur d’exemple dans PowerShell avec `-WatchGearDb "%APPDATA%\\RslHelper\\Config"` pour diffuser la base RSL Helper par défaut sans passer par la console ; ajoutez d’autres options après le nom du `.bat` pour des réglages avancés.

## Remerciements

Merci beaucoup à **[STBL] Nasgor** pour ses contributions inestimables,  
à **[SP] Panda** pour ses Sellfiles,  
à **KruYseN** pour ses vidéos de nettoyage d’équipement,  
et bien sûr à **Farbstoff** pour RSL Helper !

## Auteur
Réalisé par [STBL] Nusi㊷  
Localisation par Codex

© Nusi㊷ - 2025
