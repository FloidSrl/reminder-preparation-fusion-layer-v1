# Echoes Minimal Accepted Observation Profile v1

## Scope

Questa nota chiude il cancello di ingresso osservativo Echoes per la sola slice:

- `reminder revisione v1`

Non introduce nuova semantica reminder in Echoes.
Non sposta precedence o readiness nell adapter.

## Regola prescrittiva

L adapter Echoes della slice accetta e mappa solo un profilo minimo esplicito di `fact_type`.

Obiettivi:

- evitare crescita opportunistica dell adapter
- impedire che observation fuori profilo influenzino il mapping
- mantenere `artifact_presence_signal` come segnale debole
- lasciare a Preparation ogni decisione di precedence e readiness

## Classificazione minima

| fact_type | ruolo nella slice | classificazione | effetto ammesso nel mapping | note di boundary |
| --- | --- | --- | --- | --- |
| `revision_due_fact` | fatto osservativo esplicito sul contesto revisione | `required` | puo concorrere al `due_context` a valle tramite `observations` | unico tipo osservativo forte ammesso insieme a `extracted_due_fact`; non basta da solo a rendere il caso `ready` |
| `extracted_due_fact` | fatto osservativo estratto e validato sul contesto revisione | `required` | puo concorrere al `due_context` a valle tramite `observations` | stesso ruolo forte di `revision_due_fact`; non decide readiness |
| `vehicle_identity_fact` | identita minima veicolo | `conditionally_useful` | puo popolare `vehicle_identity` | non genera `due_context`; nessun fallback da observation non ammesse |
| `registered_owner_fact` | soggetto osservato come intestatario | `conditionally_useful` | puo popolare `registered_owner` e `recipient_candidates` | non risolve da solo il recipient finale |
| `duplicate_relation_fact` | stato osservativo di relazione/duplicazione | `conditionally_useful` | puo alimentare solo `duplicate_state` | non decide direttamente `blocked`; la decisione resta in Preparation |
| `artifact_presence_signal` | sola presenza di artifact rilevante | `weak_signal_only` | puo restare observation di supporto e trace debole | non deve mai generare `due_context`, nemmeno per fallback implicito |
| ogni altro `fact_type` | fuori dal profilo minimo v1 | `ignored` | nessuno | l adapter lo ignora esplicitamente e non alza nuova semantica |

## Ammissibilita adapter-side

Regole minime:

- l adapter applica una whitelist esplicita dei `fact_type` ammessi
- le observation fuori whitelist sono ignorate esplicitamente
- i `fact_type` `required` sono gli unici ammessi a concorrere davvero al `due_context`
- `artifact_presence_signal` non basta mai da solo e non genera `due_context`
- `duplicate_relation_fact` puo solo alimentare `duplicate_state`
- nessun fallback semantico puo nascere da `correlation_keys` di observation fuori profilo

## Matrice minima observation -> esito atteso a valle

Questa matrice descrive cosa le observation possono concorrere a produrre in Preparation.
Non trasferisce readiness nell adapter.

| combinazione minima osservativa | massimo effetto atteso a valle |
| --- | --- |
| `revision_due_fact` oppure `extracted_due_fact` + recipient e addressing gia risolti + nessun duplicate blocking | puo concorrere a `ready` |
| `revision_due_fact` oppure `extracted_due_fact` + recipient/addressing risolti + warning lecito gia previsto dal modello | puo concorrere a `ready_with_warnings` |
| solo `artifact_presence_signal` | al massimo `not_ready` |
| nessun fatto `required` sul due | al massimo `not_ready` |
| pluralita di candidati recipient non risolta oppure conflitto sul due gestito da Preparation | puo concorrere a `manual_review_required` |
| `duplicate_relation_fact` con stato non `unique` | puo concorrere a `blocked`, ma la decisione resta in Preparation |

## Chiusura di boundary

Per la slice `reminder revisione v1`:

- Echoes osserva
- l adapter filtra e mappa secondo il profilo minimo
- Preparation compone, applica precedence e valuta readiness
- Revify esegue
