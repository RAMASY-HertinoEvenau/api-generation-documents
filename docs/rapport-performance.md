# Rapport de performance

Ce document resume la methode utilisee pour mesurer les performances du service.

## Objectif

Verifier le traitement d'un batch de 1000 documents avec les indicateurs suivants :

- temps total
- debit moyen et debit instantane
- CPU agregee API + worker
- memoire agregee API + worker
- progression du batch dans le temps

## Methode

- le rendu PDF est execute dans un pool de `worker_threads`
- chaque thread garde un template compile en cache
- les PDFs sont ecrits en streaming dans GridFS
- le benchmark interroge regulierement l'API pour suivre le batch
- les processus surveilles sont echantillonnes avec `pidusage`

## Procedure

1. Demarrer MongoDB et Redis.
2. Installer les dependances si besoin.
3. Construire le projet avec `npm run build`.
4. Lancer `npm run benchmark:local`.
5. Consulter `benchmark-results/<timestamp>/report.md`.

## Fichiers generes

- `samples.json`
- `summary.json`
- `report.md`
- `api.log`
- `worker.log`

## Lecture des resultats

- une progression reguliere indique un traitement stable
- un debit proche de la moyenne sur la duree montre que la charge est bien absorbee
- une memoire relativement stable confirme l'absence de buffer global pour les PDFs
- un CPU plus eleve cote worker est attendu, car le rendu PDF est la partie la plus couteuse
