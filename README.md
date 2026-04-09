# Reminder Preparation / Fusion Layer v1

## Purpose

`Reminder Preparation / Fusion Layer v1` prepares reminder-ready records from heterogeneous candidate and support sources with different roles and reliability.

The module:

- imports candidate lists and support data from external and internal sources
- normalizes vehicle identity, contacts, and revision verification state
- preserves field-level provenance and quality
- decides whether a record is ready, excluded, or requires verification
- emits a traceable `ReminderPreparedRecordV1` for the downstream reminder layer

The module stops before any reminder dispatch or communication execution.

## Boundary

Responsibility split is strict:

- `Echoes` observes, normalizes, and stores internal history and evidence
- `Reminder Projection Consumer` computes reminder projection candidates from persisted observational ingestions
- `Reminder Preparation / Fusion Layer v1` prepares reminder-ready records from heterogeneous sources
- `Revify` executes and traces communications
- `Eventor` canonicalizes human acts
- `Interpretation` reads gaps and non-canonical signals

This repository must not absorb `Revify`, `Eventor`, `Interpretation`, or projection-consumer semantics.

## Source Domains And Precedence

Admitted source domains in v1:

- `ACI CSV`
- `YAP CSV`
- `Echoes` internal history or read model
- `External Verification Adapter`

Source roles stay explicit. They do not collapse into a single indistinct truth.

V1 precedence by domain:

- external candidate and due data: `ACI`
- contacts: `YAP`
- internal revision history: `Echoes`
- external revision verification: `External Verification Adapter`

Each normalized field must keep:

- normalized value
- source of the chosen value
- quality or suspicion marker when relevant
- minimum merge or matching trace

`PartyIdentityV1` now lives in the same subject layer as `NormalizedVehicleIdentity` and `ContactProfile`, but stays separate from both. It models tax identity without turning the repo into a CRM:

- `natural_person`
- `sole_proprietorship`
- `organization`

In particular, `sole_proprietorship` can carry both `codiceFiscale` and `partitaIva` explicitly. The layer does not collapse them into one `taxId`, does not force them to coincide, and does not move them into postal-address logic.

The same subject layer now also hosts a narrow `institutional holder / recipient resolution` pack. Its job is to:

- classify the registral holder against a small institutional or transitional registry
- decide whether the registral holder can remain the final recipient
- substitute a reliable lessee or user when the holder is institutional
- raise a preparation review when substitution would be unsafe

## Real Intake Contracts V1

The repository now expresses three narrow real-input contracts without introducing a generic mapping engine:

- `AciCsvRowV1`: minimum candidate and due-context row for the layer
- `YapCsvRowV1`: minimum contact-enrichment row for the layer
- `ExternalVerificationInputV1`: minimum normalized external verification input

These shapes are intentionally small. They include only the fields the layer needs to:

- build deterministic operational identity
- enrich contact data
- preserve provenance
- normalize external revision evidence

The related adapter functions are local and explicit:

- `toNormalizedAciContributionV1(...)`
- `toNormalizedYapContributionV1(...)`
- `toRevisionVerificationFromExternalInputV1(...)`

They live in [src/input/intakeV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\input\intakeV1.ts) and do not imply filesystem ingestion, queueing, external automation, or a generic ETL framework.

## Intake Mapping Manifest V1

V1 mapping stays manifesto-style and source-specific.

For `ACI CSV`, the minimum operational mapping is:

- `plate` -> vehicle identity plate, required, normalized by trim/uppercase/no spaces, provenance `aci_csv`
- `vehicleType` -> vehicle identity support field, optional, normalized to lowercase, provenance `aci_csv`
- `dueMonth` -> due context month, required, parsed to integer 1..12, provenance `aci_csv`
- `dueYear` -> due context year, required, parsed to integer, provenance `aci_csv`
- `ownerName` / `addressLine` / `postalCode` / `city` / `province` -> candidate contact hints only, optional, kept as `aci_csv` provenance and supersedable by YAP

For `YAP CSV`, the minimum operational mapping is:

- `contactName` -> contact profile name, optional, trimmed, provenance `yap_csv`
- `addressLine` / `postalCode` / `city` / `province` -> postal contact fields, optional, normalized lightly, provenance `yap_csv`
- `email` -> direct contact email, optional, lowercased, provenance `yap_csv`
- `phone` -> direct contact phone, optional, space-free normalized phone, provenance `yap_csv`
- `plate` -> strong linkage key toward the ACI candidate, never an override of ACI candidate identity
- `vehicleType` / `dueMonth` / `dueYear` -> support or disambiguation fields for linkage only

## Linkage Contract V1

The ACI-to-YAP linkage contract is deliberately narrow and closed in v1.

It uses:

- `plate` as the primary strong key
- `vehicleType` as support or conflict
- `dueMonth` and `dueYear` as support or disambiguation
- `name`, `email`, and `phone` as explanatory support only

It never uses:

- fuzzy matching
- opaque scoring
- generic identity resolution
- CRM-style merge semantics

The linkage result is closed to:

- `linked`
- `not_linked`
- `ambiguous`
- `rejected`

And the main linkage reasons are closed and explainable, for example:

- exact plate match
- exact plate plus vehicle type match
- exact plate with due-context support
- missing plate on YAP
- no plate match
- multiple YAP rows for the same plate
- vehicle type conflict
- due context conflict
- insufficient linkage evidence

The local function for this is `linkAciToYapV1(...)` in [src/input/linkageV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\input\linkageV1.ts).

## Compose Flow V1

The compose flow v1 turns the already-normalized contributions into one deterministic input for `prepareReminderRecordV1(...)`.

The local function for this is `composePreparationInputV1(...)` in [src/application/composePreparationInputV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\application\composePreparationInputV1.ts).

Its rules are intentionally small:

- `ACI` always supplies the base vehicle identity and due context
- `YAP` contributes only when linkage status is `linked`
- linked `YAP` enriches contact fields but never overrides ACI vehicle identity
- `Echoes` contributes only the internal exclusion signal relevant to v1
- external verification contributes revision status when present
- `ambiguous`, `rejected`, or `not_linked` YAP contributions are recorded as ignored, never promoted silently

The compose result keeps:

- the final `PreparationInput`
- used contributions
- ignored contributions

This makes the flow replayable and inspectable without introducing a generic orchestrator.

When available, `PartyIdentityV1` can travel alongside `ContactProfile` inside the preparation input and prepared record. It remains a separate subject block:

- contact data stays in `ContactProfile`
- tax identity stays in `PartyIdentityV1`
- postal address composition is not contaminated by `codiceFiscale` or `partitaIva`

When available, `recipientResolution` can also travel through compose as a parallel subject decision:

- non-institutional owner -> owner retained
- matched institutional holder + reliable lessee -> recipient substituted to lessee
- matched institutional holder without lessee -> preparation review
- ambiguous registry match -> preparation review

This does not turn compose into a CRM merge engine. It remains a small deterministic subject-resolution step.

## Batch Flow V1

The batch flow v1 is a thin local loop over already-shaped v1 inputs.

The local function for this is `runPreparationBatchV1(...)` in [runPreparationBatchV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\application\runPreparationBatchV1.ts).

Its contract is intentionally small:

- input ACI rows are processed one by one in deterministic order
- YAP rows are consulted only for deterministic linkage
- Echoes state is injected through a local lookup function
- external verification input is injected through a local lookup function
- each ACI row produces one explicit record outcome

Each record outcome keeps visible at least:

- the source ACI row reference
- the linkage result
- used and ignored contributions
- the final evaluation
- the optional prepared record
- a small diagnostic note

The batch result keeps visible at least:

- `processedCount`
- `preparedCount`
- counts per `PreparationStatus`
- per-record outcomes

This keeps the layer operational for local replay and batch assembly without turning it into a queue consumer, workflow engine, or ingestion platform.

## Prepared Identifiers V1

The deterministic construction of:

- `preparedRecordId`
- `preparedKey`

is centralized in `buildPreparedIdentifiersV1(...)` in [buildPreparedIdentifiersV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\application\buildPreparedIdentifiersV1.ts).

This keeps the semantic contract of prepared output identifiers in one stable place. The batch flow uses it, but does not own it.

## Persistence Flow V1

The persistence flow v1 turns batch outcomes into datastore-ready write models without introducing a real DB dependency in this step.

The local function for this is `persistBatchOutcomeV1(...)` in [persistBatchOutcomeV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\application\persistBatchOutcomeV1.ts).

Its rules are narrow:

- every processed ACI row yields one `preparation_evaluation` write model
- only `ready` or `ready_with_contact_warning` outcomes yield a `prepared_record` write model
- every `prepared_record` belongs to exactly one evaluation
- no batch outcome can fan out to more than one prepared record

Supported modes:

- `dry_run`: returns exactly what would be written and writes nothing
- `apply`: hands the same payloads to small writer ports

The write models are statement-ready and aligned with the v1 datastore:

- `PreparedEvaluationWriteModelV1`
- `PreparedRecordWriteModelV1`

The persistence ports are intentionally small:

- `PreparationEvaluationWriter`
- `PreparedRecordWriter`

For PostgreSQL binding, the repo now also provides explicit SQL writers in [PostgresBatchOutcomeWriters.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\infrastructure\postgres\PostgresBatchOutcomeWriters.ts).

The binding remains intentionally small:

- SQL is explicit, not generated by an ORM
- `JSONB` columns are serialized directly from the write models
- `completed_at` is written as `NULL` when absent
- `apply` writes evaluations first, then prepared records
- `dry_run` stays unchanged and produces the same write models without executing SQL

## Local Driver V1

The repository now includes a small local driver for controlled real files:

- [runLocalPreparationDriverV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\application\runLocalPreparationDriverV1.ts)
- [runLocalPreparationDriverV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\cli\runLocalPreparationDriverV1.ts)

Its purpose is narrow:

- read a local ACI CSV
- read a local YAP CSV
- optionally read a simple local mocks JSON file for Echoes or external verification
- run the existing batch flow
- run persistence in `dry_run` or `apply`
- print a readable summary

The local CSV parser is intentionally small and explicit:

- it reads headers and rows only
- it supports direct v1 header names and simple snake_case variants
- it does not introduce a generic ingestion framework

Accepted ACI headers are defined explicitly in `ACI_HEADER_CATALOG_V1`. Small accepted aliases include:

- `plate` / `targa`
- `vehicleType` / `vehicle_type` / `tipo_veicolo`
- `dueMonth` / `due_month` / `mese_scadenza`
- `dueYear` / `due_year` / `anno_scadenza`
- `ownerName` / `owner_name` / `intestatario`
- `addressLine` / `address_line` / `indirizzo`
- `postalCode` / `postal_code` / `cap`
- `city` / `citta` / `comune`
- `province` / `provincia`

Accepted YAP headers are defined explicitly in `YAP_HEADER_CATALOG_V1`. Small accepted aliases include:

- `plate` / `targa`
- `vehicleType` / `vehicle_type` / `tipo_veicolo`
- `contactName` / `contact_name` / `nome_contatto`
- `addressLine` / `address_line` / `indirizzo`
- `postalCode` / `postal_code` / `cap`
- `city` / `citta` / `comune`
- `province` / `provincia`
- `email` / `mail`
- `phone` / `telefono` / `cellulare` / `mobile`

Expected ACI headers are the v1 fields such as:

- `sourceRowKey`
- `plate`
- `vehicleType`
- `dueMonth`
- `dueYear`
- `ownerName`
- `addressLine`
- `postalCode`
- `city`
- `province`

Expected YAP headers are the v1 fields such as:

- `sourceRowKey`
- `plate`
- `vehicleType`
- `dueMonth`
- `dueYear`
- `contactName`
- `addressLine`
- `postalCode`
- `city`
- `province`
- `email`
- `phone`

Optional mocks JSON is keyed by ACI `sourceRowKey`, for example:

```json
{
  "echoesStateByAciSourceRowKey": {
    "aci-row-1": {
      "internalRevisionFound": true
    }
  },
  "externalVerificationByAciSourceRowKey": {
    "aci-row-2": {
      "sourceRowKey": "ev-row-2",
      "plate": "AB123CD",
      "verificationStatus": "verified_current",
      "verificationChannel": "manual_portale"
    }
  }
}
```

Example local run:

```bash
npm run driver:local -- --aci fixtures/local-driver-v1/aci.csv --yap fixtures/local-driver-v1/yap.csv --mocks fixtures/local-driver-v1/mocks.json --mode dry_run
```

In `apply`, the driver uses local in-memory writers by default unless you pass concrete writers from code, so the flow remains usable without a mandatory database runtime.

The driver distinguishes a few explicit local error classes:

- file parse error: the whole file cannot be read or parsed safely, for example missing required headers or unterminated CSV quoting
- row mapping error: one concrete row cannot be mapped into the v1 shape
- row skipped: blank or malformed row excluded from processing
- row processed: row successfully mapped and sent into the batch flow
- row prepared: processed row that ultimately produced a prepared record

The CLI can also emit an optional JSON report:

```bash
npm run driver:local -- --aci fixtures/local-driver-v1/aci.csv --yap fixtures/local-driver-v1/yap.csv --mocks fixtures/local-driver-v1/mocks.json --mode dry_run --report fixtures/local-driver-v1/report.json
```

The report contains at least:

- processed count
- prepared count
- excluded count through `statusCounts`
- `needs_external_verification` count through `statusCounts`
- row issues collected during local file loading

## Party Identity V1

The repository now includes a small domain block for subject tax identity in [partyIdentityV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\domain\partyIdentityV1.ts).

The block is intentionally narrow:

- `partyKind`
- `displayName`
- optional personal or business name fields
- optional `codiceFiscale`
- optional `partitaIva`
- `taxIdentityStatus`
- light `taxIdentityWarnings`
- local `sourceTrace`

The local normalizer `normalizePartyIdentityV1(...)` only applies low-risk transformations:

- trim
- uppercase `codiceFiscale`
- remove superfluous spaces
- keep only digits for `partitaIva`
- lightweight syntax warnings on length and shape

It does not introduce:

- tax authority validation
- external fiscal services
- silent substitution between `codiceFiscale` and `partitaIva`
- identity-engine semantics

## Institutional Holder Registry And Recipient Resolution V1

The repository now includes a narrow controlled registry in [institutionalHolderRegistryV1.ts](C:\Projects\reminder-preparation-fusion-layer-v1\src\domain\institutionalHolderRegistryV1.ts).

The registry entries keep at least:

- `entryId`
- `kind`
- `canonicalName`
- `aliases`
- optional `partitaIva`
- optional `codiceFiscale`
- `isActive`
- optional `notes`

Supported institutional kinds are intentionally small:

- `bank_finance`
- `leasing`
- `rental_fleet`
- `dealer`
- `other_institutional`

Matching remains closed and prudent:

1. exact `partitaIva`
2. exact `codiceFiscale`
3. exact normalized `canonicalName`
4. exact normalized `alias`

There is no fuzzy matching, wide `contains`, or probabilistic scoring.

The local functions are:

- `classifyInstitutionalHolderV1(...)`
- `resolveRecipientFromOwnershipV1(...)`

When recipient resolution affects preparation:

- successful lessee substitution can still end in `ready` or `ready_with_contact_warning`
- missing lessee on a matched institutional holder yields `identity_mismatch_review_required`
- ambiguous registry match also yields `identity_mismatch_review_required`

The related preparation reasons stay sober:

- `recipient_substituted_to_lessee`
- `institutional_holder_without_lessee`
- `institutional_holder_match_ambiguous`

For `ExternalVerificationInputV1`, the minimum operational mapping is:

- `verificationStatus` -> `RevisionVerification.verificationStatus`, required, already within closed v1 status set
- `verificationChannel` -> `RevisionVerification.verificationChannel`, required
- `verifiedAt` -> `RevisionVerification.verifiedAt`, optional
- `lastRevisionDate` -> `RevisionVerification.lastRevisionDate`, optional
- `sourceRowKey` / `sourceBatchId` / `note` -> verification trace provenance, kept as `external_verification_adapter`

## Non-Goals

This repository does not implement:

- communication sending
- channel choice
- template rendering
- delivery tracking
- `Revify` semantics
- canonical event creation
- interpretation logic
- generic scoring or risk engines
- opaque probabilistic fusion
- aggressive fuzzy matching
- rigid coupling to the public Portale
- mandatory MIT/SIM web service integration in v1
- ORM-based persistence
- queues, buses, or CDC

## Processing Model

V1 flow:

1. Import raw ACI rows.
2. Import raw YAP rows.
3. Read internal revision history from `Echoes`.
4. Normalize vehicle identity.
5. Run deterministic matching and contact enrichment.
6. Exclude vehicles already served internally when evidence is sufficient.
7. Mark records that require external verification.
8. Incorporate any available external verification result.
9. Persist a deterministic `preparation_evaluation`.
10. Persist `0..1` deterministic `ReminderPreparedRecordV1` linked to that evaluation.

The external verification step is selective. It is not part of the default mass loop.

## Contract Keys And Trace

`identity_key` is the deterministic operational identity of the vehicle or candidate case inside this layer.

It is not:

- a canonical subject
- a strong customer id
- a full legal identity

In v1 it must depend only on the minimum operational identity inputs needed to prepare the case in a deterministic and explainable way.

`prepared_key` is the deterministic identity of the prepared output, not of the candidate.

It must change when materially relevant prepared output changes, for example:

- normalized due context
- chosen contact data
- external verification outcome used by the evaluation
- internal exclusion evidence from `Echoes`
- final `preparation_status`

`source_trace` is a structured minimum explanation, not an opaque blob. In v1 it must say at least:

- which raw records contributed
- which source won for the main prepared fields
- whether an external verification result contributed
- which precedence rules were applied
- which reasons led to the final preparation status

## Decision Grammar V1

The decision grammar is intentionally closed in v1.

`PreparationStatus` remains fixed to the existing seven statuses, and `preparation_reasons` is restricted to a small deterministic set aligned to those statuses:

- `identity_mismatch_detected`
- `internal_revision_found_in_echoes`
- `external_verification_reports_already_revised`
- `external_verification_missing_for_revision_state`
- `external_verification_failed_for_revision_state`
- `insufficient_contact_data`
- `contact_profile_contains_warning_quality`
- `record_prepared_with_deterministic_precedence`

This keeps explanations stable without turning reasons into an unbounded event log.

## Precedence And External Verification

V1 applies these minimum precedence rules:

- `ACI` wins candidate and due context
- `YAP` wins contact fields
- `Echoes` wins internal exclusion evidence
- `External Verification Adapter` wins revision resolution only for cases not reliably closable otherwise

`needs_external_verification` is therefore narrow. It applies only when identity review is not required, no internal exclusion has already closed the case, no prior verification has already confirmed external revision, minimum contact data exists, and revision state is still unresolved because verification is missing, not verifiable, or failed.

## Evaluation Cardinality

V1 cardinality is intentionally narrow:

- one `preparation_evaluation` produces `0..1` `ReminderPreparedRecordV1`
- one `ReminderPreparedRecordV1` belongs to exactly one `preparation_evaluation`
- multiple prepared records may exist over time for the same `identity_key`, but only as outputs of successive evaluations

This prevents accidental multi-output evaluation flows and keeps replay semantics deterministic.

## Determinism

For the same:

- source batches
- matching rules
- source precedence
- preparation rule version
- available external verification outcomes

the layer must produce the same:

- `identity_key`
- `prepared_key`
- `preparation_status`

## Technical Stance

V1 keeps a narrow technical posture:

- Node.js
- TypeScript
- PostgreSQL
- explicit SQL
- `zod` for local validation
- `pg` for persistence
- `pino` for logging

## Repository Layout

```text
docs/
migrations/
src/
```
