# Reminder Preparation / Fusion Layer v1

`Reminder Preparation / Fusion Layer v1` e il primo consumer reale di Echoes per il solo use case:

- `reminder revisione v1`

Formula architetturale congelata:

- Echoes osserva
- Preparation compone e valuta readiness
- Revify esegue

## Boundary

`Echoes`

- osserva, valida, persiste e traccia lineage
- espone observation facts e riferimenti strutturati
- non decide readiness
- non decide il destinatario reminder
- non esegue comunicazioni

`Preparation / Fusion`

- legge observation Echoes
- integra i contributi esterni strettamente necessari
- compone il caso reminder revisione
- risolve recipient e addressing
- valuta readiness, blocking, review e warnings
- produce `PreparedRecord`
- produce `CommunicationIntent` solo per casi pronti
- espone un adapter puro di uscita che rimappa `CommunicationIntent` in `RevifyRequestV1`

`Revify`

- consuma `RevifyRequestV1`
- esegue la comunicazione
- produce observation tecniche di execution
- non ricostruisce semantica reminder

## In Scope v1

- un solo use case: `reminder revisione v1`
- contratti v1 piccoli e spiegabili
- readiness model disciplinato
- golden scenarios iniziali

## Out Of Scope v1

- execution logic nel preparation layer
- canonical eventing
- interpretation engine generalista
- workflow engine generico
- datastore e migration in questa fase documentale
- generalizzazione multi-use-case

## Documenti

- [architecture-note.md](C:\Projects\reminder-preparation-fusion-layer-v1\docs\architecture-note.md)
- [contracts-v1.md](C:\Projects\reminder-preparation-fusion-layer-v1\docs\contracts-v1.md)
- [readiness-model-v1.md](C:\Projects\reminder-preparation-fusion-layer-v1\docs\readiness-model-v1.md)
- [golden-scenarios-v1.yaml](C:\Projects\reminder-preparation-fusion-layer-v1\docs\golden-scenarios-v1.yaml)
- [echoes-minimal-accepted-observation-profile-v1.md](C:\Projects\reminder-preparation-fusion-layer-v1\docs\echoes-minimal-accepted-observation-profile-v1.md)
- [minimal-revify-output-profile-v1.md](C:\Projects\reminder-preparation-fusion-layer-v1\docs\minimal-revify-output-profile-v1.md)

Ordine di lettura consigliato per un nuovo sviluppatore:

1. `README.md`
2. `docs/architecture-note.md`
3. `docs/contracts-v1.md`
4. `docs/echoes-minimal-accepted-observation-profile-v1.md`
5. `docs/minimal-revify-output-profile-v1.md`
6. `docs/readiness-model-v1.md`

## Public Package Boundary

Il package pubblico del modulo `src/reminderRevisionV1/index.ts` espone solo:

- `prepareReminderRevisionCaseV1`
- `mapEchoesToReminderRevisionCaseV1`
- `mapCommunicationIntentToRevifyRequestV1`
- i tipi boundary-facing minimi:
  - `ObservationInput`
  - `PreparedRecord`
  - `CommunicationIntent`
  - `ReminderRevisionCaseV1`
  - `PrepareReminderRevisionCaseResultV1`
  - `EchoesReminderRevisionAdapterInputV1`
  - `RevifyRequestV1`

Non espone come API pubblica:

- step interni del core evaluation/build/emit
- runner di test
- logica runtime o integration-specific

## How To Validate

Percorso minimo consigliato:

1. `npm run check`
2. `npm run golden:revision-v1`
3. `npm run adapter:echoes:revision-v1`
4. `npm run adapter:echoes:realistic-v1`
5. `npm run adapter:revify:revision-v1`
6. `npm run e2e:pure:revision-v1`

Significato rapido degli script principali:

- `check`: typecheck del repo
- `golden:revision-v1`: validazione del nucleo puro
- `adapter:echoes:revision-v1`: smoke test minimo del bordo Echoes
- `adapter:echoes:realistic-v1`: fixture pack Echoes-side piu plausibile
- `adapter:revify:revision-v1`: validazione del bordo `CommunicationIntent -> RevifyRequestV1`
- `e2e:pure:revision-v1`: validazione del corridoio puro completo end-to-end

Script non necessari per validare il corridoio puro:

- `driver:local`
- `start`
- `golden`

## Regole pratiche

- `source_trace` non e un dump di payload grezzi
- `resolved_recipient` e `resolved_addressing` restano separati
- `prepared_key`, `dedupe_key` e `idempotency_key` hanno ruoli diversi
- i fatti osservativi estratti e validati prevalgono sui meri segnali di presenza artifact quando insistono sullo stesso aspetto semantico

## Nota sul contratto centrale

- `PreparedRecord` e il nome del contratto documentale v1
- nel codice o nel repo esistente puo corrispondere all attuale `ReminderPreparedRecordV1`
