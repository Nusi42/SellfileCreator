# RSL Helper Sellfile Creator

Construisez, prévisualisez et exportez des règles de vente pour RSL Helper à l’aide d’une interface simple.

> Projet de fans indépendant. Aucune affiliation avec Plarium, Raid: Shadow Legends ou RSL Helper. Toutes les marques mentionnées appartiennent à leurs propriétaires.

## Fonctionnalités
- Construire et enregistrer des règles : créez des configurations et conservez une bibliothèque réutilisable.
- Aperçu de la Sellfile : visualisez les règles générées, avec ou sans votre sellfile actuelle.
- Aperçu combiné (optionnel) : faites glisser votre `.hsf` dans l’application pour la prévisualiser avec vos règles. Vous pouvez aussi déposer un fichier Configs (`.hsfc`). L’overlay confirme les types de fichiers acceptés.
- Métasets : nommez des groupes d’ensembles (ex. Vitesse + Perception) et réutilisez-les dans plusieurs règles.
- Export en un clic : exportez une HSF (Sellfile RSL Helper) prête à être chargée dans RSL Helper.

## Mode d’emploi

### Fichier Configs
- HSFC (`.hsfc`) : fichier projet spécifique à l’application. Considérez-le comme une sauvegarde que vous pouvez charger ou partager. RSL Helper ne lit pas directement HSFC.
- HSF (`.hsf`) : la Sellfile utilisée par RSL Helper. Exportez-la depuis l’application, puis chargez-la dans RSL Helper.
- Nom par défaut lors de l’enregistrement : `SellfileCreatorRules_AAAA MM JJ_HHMM.hsfc`.

### Configs Builder
- Renseignez les champs du Configs Builder et attribuez un nom clair à votre configuration.
- Cliquez sur « Ajouter comme nouvelle config » pour l’enregistrer. Sélectionnez ensuite la config dans la liste sous le builder pour l’éditer, puis validez avec « Mettre à jour la config sélectionnée ».
- Chargement/Enregistrement : utilisez « Charger des configs » et « Enregistrer des configs » pour réutiliser vos règles. Ces actions sauvegardent tout ce qui est nécessaire pour reconstruire la vue Aperçu.
- Note : cliquez sur « Ajouter une note » (ou « Modifier la note ») pour joindre une note au fichier Configs. Lors du chargement d’un fichier contenant une note, celle-ci s’affiche automatiquement.

### Structure du builder (du haut vers le bas)
- Action : Conserver ou Vendre, plus l’état Activé.
  - « Activé » contrôle la prise en compte des règles par RSL Helper. Désactivé = exporté mais ignoré. Dans l’aperçu, la ligne apparaît avec une barre blanche et le libellé de la config montre le texte Conserver/Vendre barré.
- Rang, Rareté, Faction, Niveaux.
  - Faction (optionnelle) ne s’applique qu’aux accessoires (Anneau, Amulette, Bannière).
  - Niveaux : choisissez un niveau minimum et maximum parmi +0, +4, +8, +12, +16. Des règles sont produites pour chaque palier.
  - Rareté = Auto (recommandé) : sélectionne la plus basse rareté permettant de respecter vos critères dans la fenêtre de niveaux.
    - Sans minimum de jets, Auto reste large et compatible avec toutes les raretés.
    - Vous demandez 1/2/3/4 substats à +0 ? Auto garantit que la rareté peut démarrer avec ce nombre (1 → ≥ Inhabituelle, 2 → ≥ Rare, 3 → ≥ Épique, 4 → ≥ Légendaire).
    - Vous imposez des comptes de jets (par ex. « au moins 3 jets au total ») ? Auto choisit la rareté capable d’atteindre ce volume à +16. Pour 5 jets, Mythique est sélectionnée.
    - Puce « Auto ≥ » (à côté de Rareté) : fixe un plancher pour Auto et, avec Late, ajoute des lignes « ≥ » supplémentaires aux paliers concernés.
      - Cycle : Inhabituelle → Rare → Épique. « Auto ≥ Rare » signifie qu’Auto ne descendra pas sous ≥ Rare.
      - Idéal avec Late + minima de jets. Si inactif, l’étiquette « Auto + Late » affiche une barre diagonale.
      - Exemple : Bannière SPD/ATK%, ATK% requiert 2 jets. Réglez Rareté = Auto, Mode = Late et Auto ≥ Épique.
        - Résultat : lignes Épiques sur toute la plage et lignes ≥ Légendaire à +8/+12 (la dernière montée Légendaire arrive souvent à +16).
        - Aucun objet n’est exclu uniquement parce qu’il est de rareté supérieure.
    - Présence avant +16 : si la rareté ne peut pas encore porter tous les substats souhaités, la règle utilise le maximum disponible au palier courant. À +16, vos valeurs cibles sont appliquées.

- Mainstat et Substats – trois lignes des mêmes boutons :
  1) Any
  2) PV, PV%, ATQ, ATQ%, DEF, DEF%
  3) VIT, RÉS, PRÉ, TCC, DCC
  - Mainstat accepte plusieurs choix. Aucune sélection = Any. Plusieurs choix génèrent une règle par main stat.
  - « Any » correspond à un reset rapide. Pour les substats, « Any » équivaut à aucune sélection ; dès que vous cochez un substat, Any est désactivé.
  - Substats : trois états. Clic = sélection ; clic à nouveau = verrouillage (🔒) ; clic encore = suppression. Les substats verrouillés apparaissent toujours dans la règle. Le nombre total ciblé est max(Obligatoire, Verrouillé) limité à 4.
  - Indicateur de jets : un petit cercle sur chaque substat sélectionné.
    - Clic gauche = augmenter. Clic droit = diminuer.
    - Joker (★) : les jets peuvent aller n’importe où sur ce substat.
    - Clic gauche sur ★ définit les jets minimum (vert) : 0 → 1 → 2 → 3 → 4 → 5 → ★.
    - Clic droit sur ★ définit la limite max (rouge) : 0 → 1 → 2 → 3 → 4 → ★. Une limite à 0 interdit les jets.
    - Minimum et Limite sont exclusifs.
- Substats obligatoires : à droite des Substats. Définit combien de substats sélectionnés doivent être présents. Les substats verrouillés sont toujours inclus.
- Sélection de Sets/Métasets : les chips sous la section Substats affichent les sets et métasets choisis.
- Mode Early/Late :
  - Early : chaque palier contient exactement les répartitions qui restent valides jusqu’à l’objectif final. Avec Joker + Minimum requis, Early montre toutes les répartitions possibles à chaque niveau. Les limites restent honorées.
  - Late : n’impose que ce qui est nécessaire maintenant pour rester compatible avec l’objectif +16. Pour Joker + Minimum requis, Late montre la présence aux niveaux précoces puis applique les répartitions minimales à +16. Avec des minima par stat, Late génère les bornes minimales par niveau.

Exemple : Early (2 substats) – VIT min = 2, TCC min = 1 (niveaux 0..16)
- +0 : VIT ≥ 5, TCC ≥ 5
- +4 : [10,5] et [5,10]
- +8 : [15,5], [10,10], [5,15]
- +12/+16 : [15,10]

Exemple : Late (2 substats) – VIT min = 2, TCC min = 1 (0..16)
- +0/+4 : [5,5]
- +8 : [10,5] ou [5,10]
- +12 : [15,5] ou [10,10]
- +16 : [15,10]

Exemple : Early (3 substats) – VIT min = 2, TCC min = 1, DCC libre, Obligatoire = 3
- +0 : [VIT, TCC, DCC] ≥ [5,5,5]
- +4 : répartitions à un jet : [10,5,5], [5,10,5], [5,5,10]
- +8 : répartitions à deux jets (respect des limites)
- +12/+16 : [15,10,5]

Exemple : Late (3 substats) – VIT min = 2, TCC min = 1, DCC libre, Obligatoire = 3
- +0/+4 : [5,5,5]
- +8 : [10,5,5] ou [5,10,5]
- +12 : [15,5,5] ou [10,10,5]
- +16 : [15,10,5]

Astuce : utilisez les limites pour interdire les jets sur un substat. Depuis ★, clic droit puis définissez la limite à 0. Par exemple, fixez DCC à 0 pour conserver sa valeur de base tandis que VIT/TCC reçoivent les jets.

Exemple : Verrouiller un substat, en imposer deux
- Sélectionnez VIT, PV, ATQ. Double-cliquez sur VIT pour le verrouiller (🔒).
- Substats obligatoires = 2.
- Résultat : les règles incluent VIT+PV et VIT+ATQ, mais jamais PV+ATQ sans VIT.

Exemple : Concentrer les jets sur 3 substats, interdire le 4ᵉ
- Objectif : conserver les objets avec VIT, TCC, DCC et l’un de PV%/ATQ%/DEF%, mais sans jets sur ce quatrième substat.
- Sélectionnez VIT, TCC, DCC, PV%, ATQ%, DEF%.
- Substats obligatoires = 4.
- Indicateurs :
  - Depuis ★, clic gauche (minima) : appliquez VIT/TCC/DCC à vos minima (ex. 1 chacun).
  - Depuis ★, clic droit (limite) : fixez PV%/ATQ%/DEF% à 0.
- Résultat : le quatrième substat varie parmi les trois mais ne reçoit aucun jet ; VIT/TCC/DCC obtiennent les jets.

Exemple : Early avec Joker (substats sélectionnés uniquement)
- Sélectionnez VIT et PRÉ.
- Indicateurs : VIT min = 2 ; PRÉ = ★.
- Substats obligatoires : Auto (2).
- Niveaux : +0 à +16.
- Résultat : Early montre les objets qui peuvent atteindre VIT(2) à +16 (lignes où VIT ou PRÉ a reçu un jet). Dès que deux jets VIT sont possibles, la ligne de minimum apparaît.

Exemple : Somme des jets avec Jokers (2 substats)
- Sélectionnez VIT et PRÉ, mettez-les sur ★.
- Substats obligatoires : 2. Jets minimum requis : 1.
- Early :
  - +4/+8/+12/+16 : deux lignes – VIT ≥ 10, PRÉ ≥ 9 et VIT ≥ 5, PRÉ ≥ 18 (répartitions minimales, stables).
- Late :
  - +0/+4/+8/+12 : simple présence (minimum requis actuel = 0) ; +16 : les deux lignes ci-dessus. Avec un minimum requis plus élevé, Late impose les répartitions minimales sur les paliers adéquats.

## Notes pour les contributeurs

- Traductions : Les archives de release contiennent les modèles de localisation dans `i18n/` (par ex. `i18n/en-US.l10n.json`, `i18n/de-DE.l10n.json`, `i18n/fr-FR.l10n.json`, `i18n/es-ES.l10n.json`, `i18n/pt-PT.l10n.json`, ainsi que les gabarits `i18n/ru-RU.l10n.json`, `i18n/uk-UA.l10n.json`, `i18n/tr-TR.l10n.json`).
- Modifier & tester : Ouvre l’application et dépose ton `*.l10n.json` modifié pour l’appliquer immédiatement pendant la session (aucune installation nécessaire).
- Soumettre des corrections : Envoie le JSON mis à jour via une pull request (préféré) ou joins-le à un ticket. Ne change pas les clés ; les clés manquantes retombent sur l’anglais.
- Langues incluses : Toutes les langues livrées sont intégrées dans le fichier HTML unique pour garantir un fonctionnement hors ligne. Tes mises à jour seront intégrées dans la prochaine release.

## Remerciements

Un grand merci à [STBL] Nasgor pour ses contributions inestimables,  
et bien sûr merci à Farbstoff pour RSL Helper !

## Auteur
Réalisé par [STBL] Nusi㊷
Localisation par Codex
