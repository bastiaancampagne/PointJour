# PointJour PWA v1 — version de test navigateur

## Architecture retenue
- Gmail : Google OAuth Web, lecture seule.
- Google Agenda : Google OAuth Web, lecture seule, aujourd'hui + 7 jours.
- Veilles : 1 à 3 thèmes, jusqu'à 10 sous-thèmes par thème.
- Paie : reprend le flux collecté par VeilleJurSoc et ses sources spécialisées.
- Autres thèmes : dans cette V1, recherche Web ciblée vers des domaines de confiance, ouverte dans le navigateur.
- Aujourd'hui / Archives : disponibles pour le flux Paie ; historique quotidien global conservé localement.

## Pourquoi les thèmes libres n'aspirent pas automatiquement tout le Web dans cette V1
Une PWA statique publiée sur GitHub Pages ne doit pas contenir une clé secrète de moteur de recherche. La mettre dans JavaScript l'exposerait à tout visiteur. Après validation de l'ergonomie, un petit service de recherche côté serveur/GitHub Action pourra alimenter automatiquement Aujourd'hui et Archives pour les thèmes libres.

## Mise en route
1. Dans Google Cloud, créez/utilisez un client OAuth 2.0 de type « Application Web ».
2. Ajoutez l'origine GitHub Pages de PointJour aux origines JavaScript autorisées.
3. Remplacez la valeur `GOOGLE_CLIENT_ID` dans `config.js`.
4. Déposez le contenu de ce dossier à la racine du dépôt GitHub Pages PointJour.

## Contrôles effectués
- JavaScript validé avec `node --check`.
- Manifest PWA et Service Worker inclus.
- Aucune clé secrète incluse.
- Icônes 192 et 512 générées depuis l'icône PointJour fournie.
- Aucun fournisseur alternatif à Gmail / Google Agenda.
