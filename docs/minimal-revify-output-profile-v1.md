# Minimal Revify Output Profile v1

Questo documento definisce il profilo minimo di uscita tra:

- `Preparation / Fusion`
- `Revify`

per la sola slice:

- `reminder revisione v1`

## Obiettivo

L'output verso Revify deve trasportare un intent gia semanticamente chiuso da Preparation.

Revify riceve un payload minimale e consumabile per l'execution, ma:

- non decide readiness
- non ricostruisce recipient
- non ricostruisce addressing
- non reinterpreta i canali
- non genera contenuto messaggio

## Distinzione tra identificativi

- `intent_ref`
  - e il riferimento al `CommunicationIntent` prodotto da Preparation
  - identifica quale intent chiuso sta venendo consegnato a Revify
- `idempotency_key`
  - e la chiave deterministica di deduplica operativa calcolata da Preparation
  - serve a evitare re-invii logici dello stesso intent
- `request_id`
  - non viene introdotto in v1
  - sarebbe ridondante rispetto a `intent_ref` se non aggiunge una semantica distinta e necessaria

## Contratto minimo richiesto da Revify

`RevifyRequestV1` deve ricevere gia risolti:

- riferimento all'intent
- riferimento al prepared record
- use case
- recipient
- channels
- addressing
- content context minimo
- policy flags, se presenti
- idempotency key
- created_at

## Regole prescrittive

- `channels` devono essere trasportati esattamente come decisi da Preparation
- `addressing` deve essere trasportato senza ricostruzione o enrichment aggiuntivo
- `recipient` deve essere trasportato senza nuova resolution
- `content_context` contiene solo:
  - `projected_due_at`
  - `due_basis`
  - `due_precision`
- `policy_flags`, se presenti, devono essere propagati invariati
- `policy_flags`, se assenti, non devono essere inventati

## Limite esplicito del mapping di uscita

Il mapping `Preparation -> Revify` puo:

- rimappare naming
- rimappare nesting
- preservare i campi minimi necessari all'execution

Non puo:

- rieseguire readiness logic
- filtrare o rankare i canali
- inferire policy
- introdurre semantics di transport
- introdurre semantics di provider
- introdurre message generation o template logic
