# Readiness Model v1

## Stati

```yaml
ReadinessStatus:
  ready:
    meaning: caso completo ed eseguibile
    emits_intent: true

  ready_with_warnings:
    meaning: caso eseguibile con warning accettabili
    emits_intent: true

  not_ready:
    meaning: caso incompleto ma non bloccato ne ambiguo al punto da review
    emits_intent: false

  blocked:
    meaning: caso non eseguibile per impedimento deterministico
    emits_intent: false

  manual_review_required:
    meaning: caso non chiudibile deterministicamente senza intervento umano
    emits_intent: false
```

## Distinzione netta

`not_ready`

- il caso non e ancora completo
- manca qualcosa, ma non c e un conflitto forte

`blocked`

- esiste un impedimento deterministico e attuale
- il caso non puo andare in execution

`manual_review_required`

- il sistema non deve decidere da solo
- esiste ambiguita o conflitto non risolto

## Blocking reasons

```yaml
BlockingReasons:
  - recipient_unresolved
  - addressing_insufficient_or_invalid
  - duplicate_or_superseded_unresolved
  - non_contactable_by_policy
  - evidence_insufficient_hard_stop
```

## Review reasons

```yaml
ReviewReasons:
  - recipient_ambiguity
  - source_conflict_unresolved
  - due_context_conflict
  - duplicate_resolution_ambiguous
  - institutional_holder_without_resolved_user
```

## Warnings

```yaml
WarningFamilies:
  - recipient_low_confidence
  - mixed_source_addressing
  - due_precision_reduced
  - partial_but_sufficient_contributions
  - minor_conflict_resolved_by_precedence
  - known_operational_limit
```

## Due model

```yaml
DueModel:
  due_context:
    due_at: date?
    due_basis: registry_document | extracted_fact | derived_rule
    due_precision: exact_day | month_only | coarse
```

Regole:

- `due_context` e il risultato usabile dal reminder layer
- `due_basis` spiega da dove arriva
- `due_precision` ne dichiara la precisione

`due_context` non e di per se una blocking reason assoluta.

Puo portare a:

- `not_ready` se manca ancora evidenza sufficiente
- `blocked` se diventa hard stop operativo
- `manual_review_required` se il problema e conflittuale o ambiguo

## Precedence

```yaml
PrecedenceRule:
  statement: extracted_and_validated_observational_facts prevail over mere artifact_presence_signals when they refer to the same semantic aspect
```
