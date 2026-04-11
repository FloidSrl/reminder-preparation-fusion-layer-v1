# Contracts v1

## Scope

Questi contratti valgono solo per:

- `reminder revisione v1`

## ObservationInput

```yaml
ObservationInput:
  observation_id: string
  idempotency_key: string?
  source_system: string
  source_adapter: string
  source_domain: string
  observed_at: datetime
  ingested_at: datetime
  asset_ref: string
  case_candidate_ref: string?
  document_ref: string?
  evidence_ref: string?
  fact_type: string
  fact_payload: object
  confidence: low | medium | high
  correlation_keys:
    vehicle_plate: string?
    registry_subject_key: string?
    document_number: string?
    external_case_key: string?
  lineage_anchors:
    source_batch_id: string?
    source_row_key: string?
    extraction_id: string?
    parser_run_id: string?
```

Regole:

- nessuna semantica reminder nel contratto
- `fact_payload` contiene il fatto osservato
- nessuna readiness
- nessun intent

## PreparedRecord

Nota:

- `PreparedRecord` e il nome del contratto documentale v1
- nel codice o nel repo esistente puo corrispondere all attuale `ReminderPreparedRecordV1`

```yaml
PreparedRecord:
  preparation_evaluation_id: string
  prepared_record_id: string
  prepared_key: string
  source_contract_version: string
  source_trace:
    observation_refs:
      - observation_id: string
        fact_type: string
        relevance: primary | supporting
    external_refs:
      - ref_type: recipient_registry | verification | address_enrichment | due_contribution
        ref_id: string
        relevance: primary | supporting
    precedence_decisions:
      - aspect: due_context | recipient | addressing | duplicate_resolution
        winner_type: observed_fact | external_contribution | derived_value
        rationale: string
  subject_identity:
    registered_owner: object?
    final_subject: object?
  vehicle_identity:
    plate: string?
    vehicle_type: string?
  revision_context:
    due_context:
      due_at: date?
      due_basis: registry_document | extracted_fact | derived_rule
      due_precision: exact_day | month_only | coarse
    duplicate_state: unique | duplicate | superseded | unresolved
  recipient_candidates:
    - candidate_id: string
      role: registered_owner | lessee | user | other
      confidence: low | medium | high
  resolved_recipient:
    subject_ref: string?
    resolution_basis: owner_retained | lessee_resolved | manual_none
    confidence: low | medium | high
  resolved_addressing:
    postal_address: object?
    digital_address: object?
    addressing_basis: direct | enriched | mixed
    confidence: low | medium | high
  readiness_status: ready | ready_with_warnings | not_ready | blocked | manual_review_required
  blocking_reasons: string[]
  review_reasons: string[]
  warnings: string[]
  projected_due_at: date?
  campaign_semantics:
    use_case: reminder_revisione_v1
  dedupe_key: string
  created_at: datetime
  generated_at: datetime
```

Regole:

- `source_trace` contiene riferimenti strutturati e decisioni, non payload grezzi
- `resolved_recipient` e `resolved_addressing` sono separati
- `blocking_reasons` = impedimenti deterministici
- `review_reasons` = ambiguita o conflitti da review umana

## CommunicationIntent

```yaml
CommunicationIntent:
  communication_intent_id: string
  intent_type: reminder_revision_v1
  intent_reason: ready | ready_with_warnings
  recipient:
    subject_ref: string
    recipient_role: registered_owner | lessee | user
  channels:
    - postal
    - pec
    - email
    - sms
  addressing:
    postal_address: object?
    digital_address: object?
    addressing_basis: direct | enriched | mixed
  payload:
    prepared_record_ref: string
    reminder_context:
      projected_due_at: date?
      due_basis: registry_document | extracted_fact | derived_rule
      due_precision: exact_day | month_only | coarse
  priority: low | normal | high
  idempotency_key: string
  created_at: datetime
  requested_execution_window: object?
  policy_flags:
    requires_postal_fallback: boolean?
    suppress_digital: boolean?
```

Regole:

- Revify deve poter eseguire senza ricostruire semantica reminder
- l addressing necessario all execution sta gia nell intent

## RevifyRequestV1

```yaml
RevifyRequestV1:
  intent_ref: string
  prepared_record_ref: string
  use_case: reminder_revisione_v1
  recipient:
    subject_ref: string
    recipient_role: registered_owner | lessee | user
  channels:
    - postal
    - pec
    - email
    - sms
  addressing:
    postal_address: object?
    digital_address: object?
    addressing_basis: direct | enriched | mixed
  content_context:
    projected_due_at: date?
    due_basis: registry_document | extracted_fact | derived_rule
    due_precision: exact_day | month_only | coarse
  idempotency_key: string
  created_at: datetime
  policy_flags:
    requires_postal_fallback: boolean?
    suppress_digital: boolean?
```

Regole:

- nasce solo come rimappatura pura di `CommunicationIntent`
- non ricostruisce recipient o addressing
- trasporta `channels` esattamente come decisi da Preparation
- non esporta readiness logic
- non introduce `request_id` separato in v1

## CommunicationObservation

```yaml
CommunicationObservation:
  communication_observation_id: string
  communication_intent_ref: string
  execution_status: accepted | queued | delivered | failed | read | clicked
  observed_at: datetime
  channel: postal | pec | email | sms
  technical_payload: object
  provider_ref: string?
```

## Distinzione chiavi

`prepared_key`

- identifica materialmente il prepared record
- cambia quando cambia il contenuto reminder-rilevante

`dedupe_key`

- serve al Preparation Layer
- evita doppie preparazioni equivalenti

`idempotency_key`

- serve al confine verso Revify
- evita doppia execution dello stesso intent
