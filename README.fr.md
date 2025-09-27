# RSL Helper Sellfile Creator

Construisez, prévisualisez et exportez des règles de vente pour RSL Helper via une interface simple.

> Projet de fans indépendant. Aucune affiliation avec Plarium, Raid: Shadow Legends ou RSL Helper. Toutes les marques citées appartiennent à leurs propriétaires.

## Fonctionnalités
- Construire et enregistrer des règles : créez des configurations et conservez une bibliothèque réutilisable.
- Aperçu du Sellfile : visualisez les règles générées, avec ou sans votre sellfile actuel.
- Aperçu combiné (optionnel) : faites glisser votre `.hsf` dans l’application pour la prévisualiser avec vos règles. Vous pouvez aussi déposer un fichier Configs (`.hsfc`). L’overlay confirme les types de fichiers acceptés.
- Méta-ensembles : nommez des groupes d’ensembles (ex. Vitesse + Perception) et réutilisez-les dans plusieurs règles.
- Export en un clic : exportez un fichier HSF (Sellfile RSL Helper) prêt à être chargé dans RSL Helper.

## Mode d’emploi

### Fichier Configs
- HSFC (`.hsfc`) : fichier projet spécifique à l’application. Considérez-le comme une sauvegarde que vous pouvez charger ou partager. RSL Helper ne lit pas directement HSFC.
- HSF (`.hsf`) : la Sellfile consommée par RSL Helper. Exportez-la ici puis chargez-la dans RSL Helper.
- Nom par défaut lors de l’enregistrement : `SellfileCreatorRules_AAAA MM JJ_HHMM.hsfc`.

### Configs Builder
- Renseignez les champs du Configs Builder et attribuez un nom clair à votre configuration.
- Cliquez sur « Ajouter comme nouvelle config » pour l’enregistrer. Sélectionnez ensuite la config dans la liste sous le builder pour l’éditer, puis validez avec « Mettre à jour la config sélectionnée ».
- Charger/Enregistrer : utilisez « Charger des configs » et « Enregistrer des configs » pour réutiliser vos règles. Ces actions conservent tout ce qu’il faut pour reconstruire l’aperçu.
- Note : cliquez sur « Ajouter une note » (ou « Modifier la note ») pour joindre une note au fichier Configs. Lors du chargement d’un fichier contenant une note, celle-ci s’affiche automatiquement.

### Structure du builder (du haut vers le bas)
- Action & Activé : Déterminez ce qui se passe lorsque l’objet correspond.
  - `Conserver` marque l’objet comme Conserver ; RSL Helper le laisse intact.
  - `Vendre` marque l’objet comme Vendre ; RSL Helper le place dans la file de vente.
  - L’interrupteur « Activé dans le fichier de vente » décide si les lignes exportées restent actives. Les configs désactivées sont exportées mais apparaissent barrées et inactives dans RSL Helper.
- Rang : Limitez la règle à certains rangs d’étoiles si vous souhaitez traiter différemment les pièces 6★ et 5★. `Tous` laisse tout éligible.
- Niveaux : Choisissez un niveau minimum et maximum parmi +0, +4, +8, +12, +16. Les lignes ne sont générées qu’à l’intérieur de cette fenêtre.
- Rareté : `Auto` (recommandé) sélectionne la rareté la plus basse qui respecte vos critères aux niveaux choisis.
  - Pas de minima par stat ni de somme globale ? Auto garde la règle large pour toutes les raretés.
  - Besoin de 1/2/3/4 sous-stats au départ ? Auto garantit que la rareté peut démarrer avec ce nombre (1→≥ Inhabituelle, 2→≥ Rare, 3→≥ Épique, 4→≥ Légendaire).
  - Besoin d’un total de jets ? Auto choisit la rareté la plus basse capable d’atteindre cette somme à +16 (5 jets demandent Mythique).
  - Puce `Auto ≥` (à côté de Rareté) : relève le plancher et, en mode Tard, ajoute des branches ≥ supplémentaires aux paliers +4/+8/+12.
    - Cycle : Inhabituelle → Rare → Épique. « Auto ≥ Rare » exclut Inhabituelle.
    - Actif uniquement lorsque Rareté = Auto et Seuils par jalons = Tard. Sinon la puce affiche une barre diagonale.
    - Exemple : Bannière SPD/ATQ% avec 2 jets sur ATQ%. Rareté = Auto, Seuils = Tard, Auto ≥ Épique. Résultat : lignes Épiques à chaque palier et ≥ Légendaire à +8/+12 pour garder les pièces rares admissibles.
  - Avant +16, le builder s’aligne sur le nombre de sous-stats réellement possible pour la rareté. À +16, votre objectif complet s’applique.
- Faction : Restreignez les règles d’accessoires à une faction donnée pour viser une équipe précise. Anneaux, Amulettes et Bannières respectent ce filtre ; l’armure l’ignore, donc `Tous` reste le choix sûr.
- Emplacements : Ciblez certaines pièces (Arme, Bottes, etc.) afin que les objets hors slot ne correspondent pas. Laissez vide pour couvrir tous les emplacements.
- Ensembles & Méta-ensembles : Filtrez sur des ensembles explicites ou des méta-ensembles nommés quand seules certaines combinaisons sont autorisées. Vide = tous les ensembles.
- Stat principale : Définissez les stats principales acceptées.
  - Sélection multiple autorisée ; aucune sélection = tout est valide.
  - Plusieurs stats principales génèrent chacune leur ligne pour rester explicites à l’export.
- Sous-stats : Définissez ce qui compte.
  - États : premier clic = sélectionner, second = verrouiller (🔒), troisième = retirer. Les verrouillés apparaissent toujours.
  - `Any` réinitialise la sélection et signifie « aucune restriction ». Dès que vous choisissez des sous-stats précis, `Any` se désactive.
  - Chaque ligne applique `max(Obligatoires, verrouillés)` avec un maximum de quatre sous-stats. Verrouiller réserve donc la place.
- Bascule Flex : Si vous avez plus d’options que de sous-stats requis, Flex répartit ces options sur toutes les permutations valides pour générer chaque combinaison. Les verrouillés restent fixés et la bascule se désactive seule lorsqu’il n’y a plus rien à faire tourner.
- Indicateur de jets : Chaque sous-stat sélectionné affiche un cercle pour les améliorations.
  - Clic gauche augmente l’exigence ; clic droit la réduit.
  - Depuis ★ : gauche passe sur un minimum vert (0→1→…→5), droite sur une limite rouge (0→1→…→4).
  - Avec une limite rouge, gauche réduit le plafond (1→0→★) et droite l’augmente (0→1→…→4→★). Minimum et limite s’excluent mutuellement.
- Sous-stats obligatoires : Définissez combien de vos sous-stats sélectionnés doivent être présents.
  - `Auto` reste aligné sur votre sélection (max. quatre).
  - Les sous-stats verrouillés (🔒) comptent toujours et des avertissements apparaissent en cas de combinaison impossible.
- Jets minimaux (global) : Fixez le nombre total de jets que doivent partager vos sous-stats sélectionnés ou verrouillés. `0` saute le contrôle global. Tôt n’affiche que les divisions capables d’atteindre l’objectif à +16.
- Seuils par jalons : Contrôlez la façon dont les minima par stat s’appliquent avant +16 lorsque vous exigez des jets minimum.
  - `Tôt` suit les jets déjà acquis à chaque palier.
  - `Tard` demande uniquement ce qui doit exister maintenant pour que l’objectif +16 reste atteignable.
  - Le basculement ne compte que si un sous-stat a Min > 0 ou si le minimum global est > 0.

### Niveaux & jets : mémo rapide
- Seuils Tôt : dès que vos exigences sont réalisables, les lignes se stabilisent. Avant cela, Tôt n’affiche que des combinaisons valides.
- Somme Σ : les jets minimum s’appliquent à la somme totale des jets sur les sous-stats sélectionnés au niveau cible.
- Jokers et somme minimale : Avec uniquement des sous-stats ★ et une somme minimale > 0, Tôt n’affiche que les divisions minimales par palier. Tard répète ces divisions aux paliers précoces et à +16.
- Mythique (5 jets) : La rareté Mythique peut atteindre cinq jets sur un sous-stat à +16 (contre quatre sinon). Lorsqu’elle est autorisée, le générateur tient compte du jet supplémentaire dès +0.

### Valeurs de sous-stats (minima)
- Ouvrez le dialogue « Valeurs des sous-stats… » à droite des contrôles de niveau.
- Les valeurs sont globales : elles s’appliquent à toutes les configs.
- Paramétrez des minima par sous-stat pour 6★ et 5★ ; activez 4★–1★ si nécessaire.
- Ces valeurs déterminent les seuils utilisés par plage de niveau (0–3, 4–7, 8–11, 12–15, 16).

### Méta-ensembles
- Cliquez sur « Gérer les méta-ensembles… » pour ouvrir le dialogue.
  - Créez ou renommez des méta-ensembles et choisissez les ensembles qu’ils contiennent. L’interface reprend la recherche du sélecteur d’ensembles.
  - Des méta-ensembles de démarrage sont fournis ; éditez-les ou supprimez-les à tout moment.
  - « Réinitialiser » propose des options sûres lorsqu’un méta-ensemble est en cours d’usage (supprimer, remplacer par des ensembles explicites ou par un autre méta-ensemble).

### Vente finale
- Bascule à côté du bouton Export pour ajouter des règles de vente destinées aux objets restants. Activée par défaut.
- Choisissez si cela concerne Artefacts et/ou Accessoires et quels intervalles de niveau (0–3, 4–7, 8–11, 12–15, 16). Par défaut : 0–15 pour éviter la vente de pièces +16.
- Sans vente finale, RSL Helper conserve tout ce qui ne correspond à aucune règle. Une vente n’a lieu que si une règle explicite le demande.
- Avec vente finale active, les règles générées incluent tous les ensembles connus. L’aperçu indique « Tous les ensembles connus » pour alléger la vue, mais le fichier exporté liste chacun d’eux.

### Gestion des configs
- Les configs sauvegardées apparaissent sous forme de puces sous le builder. Clic gauche pour sélectionner ; clic droit pour dupliquer, déplacer, copier ou supprimer.
- « Delete Configs » supprime toutes les configs (avec confirmation).
- Survol lié : Survoler une puce surligne toutes les lignes correspondantes dans l’aperçu et inversement.
- Clic lié : Cliquer une ligne de la table sélectionne la config d’origine (les lignes provenant du HSF de base n’affectent pas la sélection).
- Copie de secours : Si l’accès au presse-papiers échoue, un dialogue s’ouvre avec le texte présélectionné pour copie manuelle.

### Aperçu de la Sellfile (avec fichier de base optionnel)
- Combinez vos règles avec une `.hsf` existante si besoin.
  - « Charger Sellfile RSL Helper » (ou glisser-déposer) ajoute le fichier.
  - « Vider » retire le fichier chargé.
- L’icône palette ouvre la gestion des couleurs pour personnaliser texte et fond des sous-stats.
- Le tableau liste toutes les règles à exporter. Les colonnes « Idx » et « Cfg » indiquent la config source ; pour les lignes issues du fichier de base, « Cfg » reste vide.

### Contrôles de l’aperçu
- Gérer les couleurs : via l’icône palette ; « Restaurer par défaut » remet les recommandations.
- Menu des colonnes (clic droit sur l’en-tête) :
  - Réinitialiser les colonnes : restaure colonnes et largeurs par défaut.
  - Ajuster la largeur : adapte les colonnes à la fenêtre.
  - Autoriser les lignes multilignes : active le retour à la ligne (utile pour les sous-stats).
  - Afficher/Masquer : cases à cocher par colonne.
- Réordonner : faites glisser un en-tête horizontalement.
- Redimensionner : faites glisser le bord droit de l’en-tête.
- Comportement du clic : cliquer une ligne sélectionne la config correspondante (sans défilement automatique). Cliquer une puce de config fait défiler jusqu’à la première ligne associée.

### Export
- « Exporter Sellfile RSL Helper fusionnée » apparaît si un fichier de base est chargé ; sinon « Exporter Sellfile RSL Helper ».
- Utilisez « Enregistrer des configs » et « Charger des configs » pour sauvegarder votre travail.
- Nom par défaut du fichier exporté : `Sellfile_AAAA MM JJ_HHMM.hsf`.

## Exemples

Les exemples supposent des minima 6★ par unité de jet : SPD=5, TRC=5, DCC=5.

Tôt vs Tard
- Tôt : les seuils reflètent les jets déjà obtenus. Avec ★ + somme minimale, seules les divisions minimales par palier sont montrées (liste stable). Sinon, Tôt énumère le progrès possible jusqu’à satisfaction des conditions puis se stabilise sur les minima (sauf exigence Σ plus élevée).
- Tard : n’exige que ce qui doit être présent maintenant pour que l’objectif +16 reste atteignable. Avec ★ + somme minimale, Tard répète ces divisions aux premiers paliers et à +16. Avec minima par stat, Tard émet les bornes minimales requises à chaque niveau.

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
- +8 : divisions à deux jets (limites respectées)
- +12/+16 : [15,10,5]

Exemple : Tard (3 sous-stats) — SPD min=2, TRC min=1, DCC libre, Obligatoires=3
- +0/+4 : [5,5,5]
- +8 : [10,5,5] ou [5,10,5]
- +12 : [15,5,5] ou [10,10,5]
- +16 : [15,10,5]

Astuce : Utilisez les limites de jets pour interdire les améliorations sur un stat. Depuis ★, clic droit → limite et fixez-la à 0. Ainsi DCC reste à la valeur de base tandis que SPD/TRC reçoivent les jets.

Exemple : Verrouiller un stat, en exiger deux
- Sous-stats : SPD, PV, ATQ. Double-cliquez sur SPD pour le verrouiller (🔒).
- Sous-stats obligatoires = 2.
- Résultat : SPD+PV et SPD+ATQ apparaissent. PV+ATQ sans SPD n’est jamais généré (les verrouillés sont toujours inclus).

Exemple : Concentrer les jets sur 3 stats et bloquer le 4ᵉ
- Objectif : Garder les objets avec SPD, TRC, DCC et l’un de PV%/ATQ%/DEF%, sans jets sur ce quatrième stat.
- Sous-stats : SPD, TRC, DCC, PV%, ATQ%, DEF%.
- Sous-stats obligatoires = 4.
- Indicateurs :
  - Depuis ★, clic gauche (minima) : définissez SPD/TRC/DCC sur les minima souhaités (ex. 1 chacun).
  - Depuis ★, clic droit (limite) : fixez PV%/ATQ%/DEF% à limite 0.
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

## Notes pour les contributeurs

- Traductions : Les archives de release contiennent des modèles de localisation dans `i18n/` (`i18n/en-US.l10n.json`, `i18n/de-DE.l10n.json`, `i18n/fr-FR.l10n.json`, `i18n/es-ES.l10n.json`, `i18n/pt-PT.l10n.json`, ainsi que des squelettes `i18n/ru-RU.l10n.json`, `i18n/uk-UA.l10n.json`, `i18n/tr-TR.l10n.json`).
- Modifier & tester : Ouvrez l’application et déposez votre `*.l10n.json` modifié pour l’appliquer immédiatement (aucune installation nécessaire).
- Soumettre des corrections : Envoyez la JSON mise à jour via une pull request (préférée) ou joignez-la à un ticket. Ne modifiez pas les clés ; les clés manquantes retombent sur l’anglais.
- Langues intégrées : Toutes les langues livrées sont compilées dans l’unique HTML pour assurer un fonctionnement hors ligne. Vos corrections seront intégrées à la prochaine version.

## Remerciements

Merci à [STBL] Nasgor pour ses contributions inestimables,  
et merci à Farbstoff pour RSL Helper !

## Auteur
Réalisé par [STBL] Nusi㊷  
Localisation par Codex
