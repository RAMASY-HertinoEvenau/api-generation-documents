# Dashboard observabilite

## Metriques a suivre

- `documents_generated_total{status="completed"}`
- `documents_generated_total{status="failed"}`
- `batch_processing_duration_seconds`
- `queue_size{state="waiting"}`
- `queue_size{state="active"}`
- `queue_size{state="failed"}`

## Lecture rapide

- generation : suivre `documents_generated_total`
- charge de la file : suivre `queue_size`
- temps de traitement : suivre `batch_processing_duration_seconds`
- erreurs : suivre `documents_generated_total{status="failed"}`

## Requetes Prometheus

```promql
sum(documents_generated_total{status="completed"})
```

```promql
sum(rate(documents_generated_total{status="completed"}[5m]))
```

```promql
histogram_quantile(0.95, sum(rate(batch_processing_duration_seconds_bucket[5m])) by (le))
```

```promql
sum(queue_size{state=~"waiting|active"})
```

## Endpoint

```text
GET /metrics
```
