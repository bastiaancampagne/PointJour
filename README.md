# PointJour PWA v3 — interface chaleureuse

Version responsive inspirée de la maquette « émeu au petit déjeuner ».

## Pages / vues
- Accueil
- Brief du jour
- Courriels Gmail
- Google Agenda
- Mes veilles
- Modification d'une veille (20 sous-thèmes maximum)
- Recherche Web
- Sources officielles
- Experts / Web
- Archives
- Paramètres
- Écran de chargement pendant l'actualisation

## Publication GitHub Pages
Déposer les fichiers à la racine du dépôt PointJour puis utiliser : Settings → Pages → Deploy from a branch → main → /(root).

Le client OAuth Web est conservé dans `config.js`. L'origine autorisée doit rester `https://bastiaancampagne.github.io`.


V8 : bouton « Continuer sans ce compte » rapproché de la carte concernée ; compteurs Accueil filtrés par Tout/Privé/Travail ; protection contre l'affectation du même compte Google aux deux profils.

## V11 HD plein écran
- suppression des illustrations dupliquées au premier plan (connexion et chargement inclus) ;
- arrière-plans préparés en 2560 × 1440 pour l'affichage PC ;
- panneaux translucides au premier plan ;
- conservation intégrale de la logique fonctionnelle V10/V9.
