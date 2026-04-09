# Reminder Preparation / Fusion Layer v1

## Architecture Note

`Reminder Preparation / Fusion Layer v1` is the narrow module that turns heterogeneous reminder candidate inputs into prepared reminder-ready records.

Its mission is not to observe, canonize, interpret, or dispatch. Its mission is to prepare.

The layer exists because reminder-relevant sources have different roles and different reliability:

- `ACI` provides the external candidate basin and due context
- `YAP` enriches or corrects contact data
- `Echoes` exposes internal observed revision history
- `External Verification Adapter` confirms ambiguous revision state when needed

These sources must not be merged into an opaque truth surface. They must remain distinguishable by role, precedence, provenance, and quality.

## Real Intake Boundary V1

The real intake boundary in v1 is deliberately narrow.

The layer accepts three local normalized input contracts:

- `AciCsvRowV1`
- `YapCsvRowV1`
- `ExternalVerificationInputV1`

These contracts are not generic ingestion abstractions. They are small source-shaped adapters that make explicit:

- which source fields matter
- which fields are required or optional
- how light normalization happens
- how provenance is retained

This keeps the layer close to the real sources without coupling it to a specific file transport, external portal workflow, or ministerial integration runtime.

## Fixed Separation

- `Echoes` observes, normalizes, and stores internal evidence
- `Reminder Projection Consumer` produces projection candidates from observational ingestions
- `Reminder Preparation / Fusion Layer v1` prepares reminder-ready records from heterogeneous sources
- `Revify` executes communication
- `Eventor` canonizes human acts
- `Interpretation` reads gaps and non-canonical signals

This layer is not:

- `echoes-core`
- the projection consumer
- `Revify`
- `Eventor`
- `Interpretation`

## Core Rule

The layer must not silently correct the originating source.

For each normalized field, the prepared record retains:

- chosen normalized value
- chosen source
- explicit quality or suspicion state when needed
- minimum matching or merge trace

Example:

- `address.value = "..."`
- `address.source = "aci_csv"`
- `address.quality = "stale_suspected"`

- `phone.value = "..."`
- `phone.source = "yap_csv"`
- `phone.quality = "enriched"`

The same separation now applies to subject tax identity. `PartyIdentityV1` is a small vertical domain block inside reminder preparation, not an extension of contact routing and not an observational concern delegated to `Echoes`.

The same architectural stance now applies to institutional holder classification and final-recipient resolution. This is still subject preparation logic, not observational storage, postal formatting, or execution logic.

## Intake Mapping Manifest V1

The intake mapping is manifesto-style rather than engine-driven.

`ACI CSV`

- contributes operational candidate identity and due context
- may carry candidate contact hints, but does not become the primary contact source when `YAP` exists
- is normalized with explicit, low-risk transformations only: trim, uppercase plate, parse due month and due year

`YAP CSV`

- contributes contact enrichment
- wins contact precedence in v1
- is normalized with explicit, low-risk transformations only: trim text, lowercase email, compact phone, normalize postal code
- may expose `plate`, `vehicleType`, `dueMonth`, and `dueYear` as linkage support only

`ExternalVerificationInputV1`

- contributes only normalized revision-verification evidence
- maps directly to `RevisionVerification`
- keeps verification channel and trace visible

The corresponding local adapter functions are intentionally small and local to the repo. They do not introduce a parser framework, ETL engine, or transport abstraction layer.

## Party Identity Boundary V1

The layer now models a narrow `PartyIdentityV1` block for the subject behind the candidate case.

This block is intentionally small:

- `partyKind`
- `displayName`
- optional personal-name fields
- optional `businessName`
- optional `codiceFiscale`
- optional `partitaIva`
- `taxIdentityStatus`
- lightweight format warnings
- dedicated `sourceTrace`

The important boundary decision is explicit:

- tax identity stays separate from recapito
- tax identity stays separate from postal-address composition
- tax identity is not collapsed into one generic `taxId`

This matters especially for `sole_proprietorship`, where `codiceFiscale` and `partitaIva` may coexist and must remain separately representable.

The local normalizer only performs low-risk formal cleanup:

- trim and whitespace compaction
- uppercase `codiceFiscale`
- digit-only normalization for `partitaIva`
- lightweight syntax warnings

It does not perform tax-authority validation, external lookups, or opaque deductions.

## Institutional Holder And Recipient Resolution V1

Some reminder candidates have a registral owner that is not the correct final recipient, for example:

- banks or finance companies
- leasing operators
- rental fleets
- dealers
- other institutional or transitional holders

This repo now handles that case with a narrow vertical pack:

- a small controlled registry of institutional holders
- a prudent exact-match classification step
- a deterministic recipient-resolution step

The classification contract is intentionally closed:

- `matched`
- `not_matched`
- `ambiguous`

Matching order is also closed and explicit:

1. exact `partitaIva`
2. exact `codiceFiscale`
3. exact normalized canonical name
4. exact normalized alias

No fuzzy matching, broad substring search, or opaque scoring is introduced.

Recipient resolution is also intentionally narrow:

- non-institutional owner -> owner retained
- institutional holder with reliable lessee or user -> recipient substituted to lessee or user
- institutional holder without reliable lessee or user -> preparation review
- ambiguous registry match -> preparation review

The block belongs here because it sits exactly between heterogeneous source fusion and prepared-recipient output. It does not belong in:

- `Echoes`, which stores observations
- the postal-address module, which formats delivery data
- `Revify`, which executes communication

## Linkage Contract V1

Linkage between `ACI` and `YAP` is a separate narrow contract.

It is not a general identity-resolution engine. It is a prudent deterministic check that answers whether a YAP contribution can be attached to an ACI candidate.

The contract is closed to these states:

- `linked`
- `not_linked`
- `ambiguous`
- `rejected`

The linkage rules are:

- `plate` is the primary strong key
- `vehicleType` can support or reject
- `dueMonth` and `dueYear` can support or disambiguate
- `name`, `email`, and `phone` can explain affinity but never create identity linkage on their own

This means:

- missing or non-matching plate cannot be rescued by contact fields
- conflicting `vehicleType` can reject an otherwise exact plate match
- multiple same-plate YAP rows can be disambiguated only by explicit support fields such as due context
- unresolved same-plate competition remains `ambiguous`

The corresponding local function is `linkAciToYapV1(...)`. It returns a small closed result with status, reason, criteria used, support fields used, and the matched candidate when one exists.

## Compose Flow V1

After intake normalization and optional linkage, the layer has one more narrow step: compose a deterministic `PreparationInput`.

This compose flow is not a workflow engine or an orchestration framework. It is a small deterministic assembly step with explicit inclusion rules.

The compose rules are:

- `ACI` always provides base vehicle identity and due context
- `YAP` enters only when linkage is `linked`
- `YAP` enriches contact data but never overrides ACI identity
- `Echoes` contributes only the internal revision exclusion signal
- external verification contributes revision status when present
- ignored contributions remain explicit and never win silently

The compose result therefore makes visible:

- which contributions were used
- which contributions were ignored
- which provenance enters the final preparation input
- which deterministic input is passed to `prepareReminderRecordV1(...)`

When available, `PartyIdentityV1` can move through the same compose path as a parallel subject block. It travels beside `ContactProfile`; it does not alter contact precedence, linkage, or postal composition semantics.

When available, recipient resolution also travels through compose as a parallel subject decision. It can change the final subject used for preparation without changing:

- vehicle identity precedence
- YAP linkage rules
- postal-address composition
- the closed preparation status set

## Batch Flow V1

The batch flow is the final local assembly step for v1.

It is not:

- a workflow engine
- a job system
- a queue consumer
- an ingestion platform
- an orchestration framework

It is a deterministic loop that, for each ACI candidate:

1. normalizes the ACI contribution
2. evaluates linkage against the available YAP rows
3. composes the deterministic preparation input
4. runs `prepareReminderRecordV1(...)`
5. returns one explicit outcome for that source row

The batch result is intentionally small and replayable:

- `processedCount`
- `preparedCount`
- counts by final `PreparationStatus`
- explicit per-record outcomes with linkage, contributions used or ignored, evaluation, and optional prepared record

This keeps the module operational in local batch mode without changing the domain boundary or introducing infrastructure semantics into the repo.

## Prepared Identifiers V1

The deterministic construction of `preparedRecordId` and `preparedKey` is a stable application concern and is centralized in one local builder.

This matters because:

- the batch flow should assemble records, not own prepared-output identity semantics
- the same deterministic rule may be reused by local replay or future persistence entry points
- the prepared-output contract stays small and inspectable in one place

## Persistence Flow V1

The persistence flow is the local step that takes batch outcomes and expresses what the layer would store in the v1 datastore.

It is not:

- a database framework
- an ORM layer
- a message-driven persistence system
- a new orchestration boundary

It is a small transformation with two modes:

- `dry_run`: build and return the evaluation and prepared-record payloads without writing
- `apply`: hand those same payloads to tiny writer ports

The persistence contract keeps the cardinality explicit:

- each processed ACI row produces exactly one `preparation_evaluation`
- each evaluation produces `0..1` `prepared_record`
- each prepared record belongs to exactly one evaluation
- no batch outcome may produce multiple prepared records

This keeps the layer replayable and datastore-aligned while avoiding any mandatory runtime connection to PostgreSQL in this step.

The SQL binding for v1 stays explicit and minimal:

- write models remain the stable application contract
- PostgreSQL writers translate them into plain `INSERT` statements
- JSON-bearing fields are serialized directly for `JSONB` columns
- evaluation rows are written before prepared-record rows
- no ORM or repository framework is introduced

This gives the layer a concrete SQL execution path without turning persistence into a larger architectural subsystem.

## Matching And Fusion Stance

V1 matching stays narrow, deterministic, and explainable.

Allowed strong keys:

- plate
- vehicle type
- due month and due year when useful

Name or contact combinations may support review, but they are not primary identity keys in v1.

V1 does not introduce:

- aggressive fuzzy matching
- opaque scoring
- unexplained identity deductions

## External Verification Boundary

External verification is an architectural capability of this layer, not a hard-coded single implementation.

In v1 it may be satisfied by:

- manual Portale consultation
- assisted or semi-automatic consultation
- official MIT/SIM web service integration when available and allowed
- another equivalent ministerial adapter

The boundary must remain open to official ministerial web services, but such integration must not become a mandatory dependency of v1.

External verification is selective:

- only for ambiguous or unresolved records
- persisted as its own traceable result
- incorporated through a stable adapter boundary

## Prepared Output

The primary deterministic decision artifact of this layer is `preparation_evaluation`.

Each evaluation produces:

- `0..1` `ReminderPreparedRecordV1`
- one explicit `preparation_status`
- one explicit `source_trace`
- one explicit `identity_key`

`ReminderPreparedRecordV1` exists only when the evaluation really produced a prepared reminder-ready output.

It is not yet:

- a dispatch
- a communication command
- a canonical event

It is a prepared, traceable, explainable record that is either:

- ready for the downstream reminder layer
- ready with warnings
- excluded
- waiting for external verification
- flagged for manual review

## Decision Grammar V1

The decision grammar stays closed and small in v1.

`PreparationStatus` is fixed to:

- `ready`
- `ready_with_contact_warning`
- `needs_external_verification`
- `already_revised_elsewhere`
- `excluded_internal_revision_found`
- `insufficient_contact_data`
- `identity_mismatch_review_required`

`preparation_reasons` is also intentionally closed. It explains the winning decision path, not every incidental detail.

V1 reasons are:

- `identity_mismatch_detected`
- `internal_revision_found_in_echoes`
- `external_verification_reports_already_revised`
- `external_verification_missing_for_revision_state`
- `external_verification_failed_for_revision_state`
- `insufficient_contact_data`
- `contact_profile_contains_warning_quality`
- `record_prepared_with_deterministic_precedence`

## Precedence Rules V1

The layer applies a narrow precedence contract:

- `ACI` is primary for candidate and due context
- `YAP` is primary for contact fields
- `Echoes` is primary for internal exclusion evidence
- `External Verification Adapter` is primary only when revision state cannot be closed reliably by the default sources

These rules are explicit and traceable. They are not probabilistic and they do not imply a generic fusion engine.

## Strict Use Of needs_external_verification

`needs_external_verification` is a narrow status in v1.

It applies only when:

- there is no identity mismatch requiring review
- no internal exclusion has already closed the case
- no external verification has already confirmed `already_revised_elsewhere`
- minimum contact data exists
- revision state is still unresolved because verification is missing, not verifiable, or failed

This means `needs_external_verification` does not override:

- `identity_mismatch_review_required`
- `excluded_internal_revision_found`
- `already_revised_elsewhere`
- `insufficient_contact_data`

## Contract Keys

`identity_key`

- represents the operational identity of the vehicle or candidate case inside the fusion layer
- is deterministic and explainable
- is not a canonical subject id
- is not a strong customer id
- is not a full legal identity

In v1 it should depend only on the fields actually needed to identify the operational case, such as plate, vehicle type, and due context when materially necessary.

`prepared_key`

- represents the deterministic identity of the prepared output
- belongs to the prepared record, not to the abstract candidate
- must change when materially relevant prepared output changes

Examples of materially relevant changes:

- contact selected by precedence
- external verification outcome incorporated
- internal `Echoes` exclusion evidence
- normalized due context
- final `preparation_status`

## Source Trace Contract

`source_trace` is not a free-form blob.

In v1 it is the minimum structured explanation of why the evaluation produced its final status and, when applicable, its prepared record.

It must include at least:

- contributing raw records
- winning sources for the main prepared fields
- optional external verification contribution
- applied precedence rules
- final status reasons

This keeps the layer explainable without turning it into a generic provenance engine.

## Minimal Local State

V1 local state stays intentionally small:

- imported source batches
- raw source records
- external verification results
- preparation evaluations
- prepared records

This is enough for:

- restart safety
- deterministic re-evaluation
- field-level provenance retention
- local trace of matching and merge decisions
- prepared record registry

No queue, bus, CDC, or ORM is required in v1.
