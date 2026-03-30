# Requetes curl

## Health checks

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/health
```

## Documentation et metriques

```bash
curl http://localhost:3000/openapi.json
curl http://localhost:3000/metrics
curl http://localhost:3000/api/metrics
```

## Creation d'un batch

```bash
curl -X POST http://localhost:3000/api/documents/batch \
  -H "Content-Type: application/json" \
  -d "{\"userIds\":[\"user-1\",\"user-2\",\"user-3\"]}"
```

## Statut d'un batch

Remplacer `<batchId>` par l'identifiant retourne a la creation.

```bash
curl http://localhost:3000/api/documents/batch/<batchId>
```

## Telecharger un document

Remplacer `<documentId>` par l'identifiant d'un document en statut `completed`.

```bash
curl http://localhost:3000/api/documents/<documentId> --output document.pdf
```
