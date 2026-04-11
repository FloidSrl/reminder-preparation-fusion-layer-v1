# AGENTS.md

## Mission

Questo repository implementa `Reminder Preparation / Fusion Layer v1`.

Il layer prepara record reminder-ready a partire da sorgenti eterogenee con qualita' e affidabilita' diverse.

Il suo compito e':
- acquisire candidate list e dati di supporto da sorgenti esterne e interne
- normalizzare identita' veicolo, contatti e stato verifica
- mantenere provenance campo-per-campo
- applicare precedence esplicite tra fonti
- produrre record preparati, tracciabili e spiegabili

Il layer non invia comunicazioni, non canonizza eventi e non decide semantica di execution.

---

## Ecosystem boundary

Formula architetturale congelata:
- Echoes osserva e normalizza
- Eventor canonizza atti umani
- Interpretation legge gli scarti
- Revify esegue e traccia la comunicazione

Questo repo:
- NON e' `echoes-core`
- NON e' `Reminder Projection Consumer v1`
- NON e' Revify
- NON e' Eventor
- NON e' Interpretation
- NON e' `wallet-core`

Questo repo e':
- un layer di preparation / fusion
- un punto di composizione spiegabile tra fonti eterogenee
- un produttore di record preparati per possibili downstream consumer

Non e':
- un execution engine
- un motore di decisione canonica
- un workflow engine
- un risk engine
- un provider integration hub

---

## Identity of this repository

Questo repo possiede:
- ingest tecnico di fonti eterogenee
- normalizzazione minima e spiegabile di identita' veicolo
- normalizzazione e composizione dei contatti
- esito di verifica esterna come capability separata
- provenance campo-per-campo
- precedence esplicite
- produzione di `ReminderPreparedRecordV1`
- tracciabilita' delle ragioni di preparation

Questo repo non possiede:
- verita' canonica di dominio
- invio reminder
- scelta canale
- template rendering
- delivery tracking
- campagne
- event semantics
- interpretation semantics
- scoring opaco
- prioritizzazione commerciale complessa
- risk engine generale
- fuzzy identity repair aggressivo

---

## Role of sources

Ruoli v1 da mantenere distinti:

- `ACI` = sorgente del candidato/scadenza esterna
- `YAP` = arricchimento/normalizzazione contatti
- `Echoes` = storico revisioni interne osservate
- `External Verification Adapter` = capability selettiva di verifica esterna

Le fonti non si fondono in una verita' indistinta.

Ogni valore normalizzato deve mantenere:
- valore
- sorgente
- qualita'/affidabilita'
- trace minima di matching o merge

Non correggere silenziosamente la sorgente originaria.

Non promuovere una fonte a verita' assoluta fuori dalle precedence dichiarate.

---

## Hard boundaries

Non introdurre in questo repo:
- invio comunicazioni
- scelta canale
- template rendering
- delivery tracking
- campagne
- semantica Revify
- eventi canonici
- semantica Eventor
- semantica Interpretation
- scoring opaco
- risk engine generale
- fuzzy matching aggressivo
- workflow engine
- queue / bus / CDC
- dipendenze tra questo repo e il consumer reminder
- ORM in v1, salvo necessita' davvero forte
- pricing / billing
- wallet consumption
- dashboard complesse come centro del modello
- logica di dispatch readiness finale travestita da preparation

Non trasformare questo repo in:
- CRM
- marketing engine
- identity resolution platform generalista
- lead scoring engine
- data warehouse generalista
- orchestration layer multi-modulo

---

## External verification boundary

La verifica esterna e' una capability astratta del layer.

In v1 puo' essere:
- manuale
- assistita
- semi-automatica

Architetturalmente deve restare aperta l’integrazione con:
- Portale operativo
- web service ufficiali MIT/SIM
- altri adapter ministeriali equivalenti

Ma:
- NON rendere il Portale una dipendenza obbligatoria del v1
- NON rendere i web service MIT/SIM una dipendenza obbligatoria del v1
- NON accoppiare il dominio a una sola modalita' di interrogazione
- NON trasformare la verification in hard dependency di tutto il layer

L'esito di verifica deve restare:
- tracciabile
- datato
- spiegabile
- separato dalla sorgente originaria

---

## Core modeling rules

Distinguere almeno questi oggetti:
- `RawSourceRecord`
- `NormalizedVehicleIdentity`
- `ContactProfile`
- `RevisionVerification`
- `ReminderPreparedRecordV1`

Trattare come concetti separati:
- identita' veicolo/candidato
- profilo contatto
- esito verifica esterna
- decisione di preparation

Non comprimere questi concetti in un unico record opaco.

Se una semplificazione tecnica unisce piu' concetti nello storage, il codice e la documentazione devono continuare a distinguerli semanticamente.

---

## Preparation semantics

Il layer non decide il reminder.
Decide solo se un record e':
- preparato
- escluso
- da verificare

Per la slice documentale congelata `reminder revisione v1`, il readiness model v1 approvato e':
- `ready`
- `ready_with_warnings`
- `not_ready`
- `blocked`
- `manual_review_required`

Gli status storici:
- `ready_with_contact_warning`
- `needs_external_verification`
- `already_revised_elsewhere`
- `excluded_internal_revision_found`
- `insufficient_contact_data`
- `identity_mismatch_review_required`

appartengono a una fase precedente del repo e non sono il modello documentale congelato della v1 approvata per questa slice.

Nuovi casi reali, in v1, devono preferibilmente ricadere in questi stati tramite `preparation_reasons`, senza proliferare nuovi status.

`preparation_reasons` deve essere:
- esplicito
- leggibile
- spiegabile
- non opaco
- non sostitutivo del vero status

Non usare gli status come contenitore implicito di semantica commerciale o operativa non dichiarata.

---

## Meaning constraints on output

`ReminderPreparedRecordV1` non e':
- un comando di invio
- un evento canonico
- una dichiarazione umana
- una decisione Eventor
- un outcome di execution
- un record di billing
- un dispatch object finale

E':
- un record preparato e spiegabile
- una composizione a precedenze esplicite
- un output tecnico/operativo per possibile downstream

Quindi puo':
- essere consumato da altri layer
- essere ricontrollato
- essere filtrato a valle
- essere superseduto da nuove informazioni

Ma non deve dichiarare piu' significato di quanto il layer possieda davvero.

---

## Determinism

A parita' di:
- stessi batch sorgente
- stesse regole di matching
- stesse precedence
- stessi esiti di verifica disponibili

il layer deve produrre lo stesso:
- `identity_key`
- `prepared_key`
- `preparation_status`

Preferire logica semplice, esplicita e spiegabile.

Non introdurre:
- randomness
- dipendenze implicite da ordine non stabile
- fallback opachi che cambiano il risultato senza trace
- correzioni automatiche non spiegabili
- fuzzy matching aggressivo non motivato

---

## Matching and precedence discipline

Il matching deve essere:
- conservativo
- spiegabile
- tracciabile
- ripetibile

Ogni merge o composizione importante deve poter spiegare almeno:
- quale fonte ha prevalso
- perche'
- con quale regola
- con quale trace minima

Le precedence devono essere:
- esplicite
- limitate
- documentate
- testabili

Non usare precedence implicite nascoste nel codice.

Non usare "best guess" aggressivi quando il caso corretto e':
- `needs_external_verification`
- `identity_mismatch_review_required`
- `insufficient_contact_data`

---

## Persistence stance

Il datastore deve restare minimo e leggibile.

Separare chiaramente:
- ingest delle fonti
- risultati di verifica esterna
- evaluation/preparation
- prepared records

Non introdurre strutture premature o generalizzazioni eccessive.

Il datastore serve a:
- trace
- restart safety
- dedupe locale se necessario
- ricostruzione della preparation
- audit operativo minimo

Non serve a:
- creare una nuova verita' canonica concorrente
- sostituire Echoes
- simulare Eventor
- assorbire Revify

---

## Security integrated into architecture

La sicurezza va trattata come parte del boundary, della provenance e del trattamento dati, non solo come hardening finale.

### Security-by-design principles
- minimizzare la superficie del layer
- minimizzare la duplicazione di dati sensibili
- distinguere fonti trusted da fonti solo ricevute
- mantenere provenance e trace spiegabile
- evitare merge opachi che nascondono l'origine del dato
- trattare contatti e identificativi come dati sensibili operativamente rilevanti
- preservare auditabilita' delle decisioni di preparation

### Trust boundaries
Questo repo deve distinguere chiaramente tra:
- feed ACI
- feed YAP
- dati Echoes
- esiti di verifica esterna
- input manuali o assistiti
- configurazione locale
- datastore locale
- log e diagnostica
- eventuali strumenti admin o export

Non assumere che una fonte sia semanticamente corretta solo perche' e' "interna" o storicamente usata.

### Input validation rules
- validare sempre i record sorgente secondo il contratto atteso
- trattare mismatch, inconsistenze e dati incompleti come casi espliciti
- non inventare correzioni silenziose
- non promuovere dati incompleti a record `ready` senza trace chiara
- ogni fallback deve essere spiegabile e testabile

### Data minimization and privacy
- persistere solo cio' che serve per preparation, provenance e audit operativo minimo
- evitare dump completi non necessari di sorgenti sensibili
- non loggare full contact payload se non strettamente necessario
- evitare esposizione gratuita di email, telefono, indirizzi o identificativi completi nei log
- non duplicare inutilmente raw source data nei layer successivi

### Provenance as security property
La provenance non e' solo un requisito funzionale.
E' anche una proprieta' di sicurezza architetturale:
- impedisce fusion opache
- rende visibili le correzioni
- rende auditabile il perche' di un output
- riduce il rischio di semantica inventata

### External verification safety
Se viene introdotta una verifica esterna:
- tracciarne sorgente, tempo e outcome
- non trattare la verifica come verita' eterna e senza contesto
- non rendere il layer dipendente da una sola modalita' di verifica
- evitare scraping o adattamenti tecnici invasivi come fondazione concettuale del repo
- proteggere eventuali dati di accesso o configurazioni di adapter esterni

### Sensitive operational surfaces
Se introduci:
- export
- inspection screen
- tooling manuale
- backfill
- override operativi
- reconciliation tool

trattali come superfici sensibili.
Non introdurli senza:
- scope chiaro
- output minimizzato
- trace dell'azione
- assenza di semantica fuori boundary
- protezione da uso casuale

---

## Security gates before expanding scope

Prima di introdurre:
- endpoint HTTP
- UI locali
- export massivi
- tooling manuale di verifica
- nuove fonti dati
- matching piu' aggressivo
- regole automatiche aggiuntive

assicurarsi che esistano almeno:
- boundary chiaro
- validazione input
- provenance mantenuta
- impatto su determinismo compreso
- impatto su privacy e data minimization compreso
- output minimizzato
- audit minimo delle decisioni nuove
- assenza di leakage di dati non necessari

---

## Testing expectations

Ogni modifica importante deve essere coperta almeno con test su:
- parsing/validation delle fonti
- matching spiegabile
- precedence applicate correttamente
- stabilita' di `identity_key`
- stabilita' di `prepared_key`
- determinismo del `preparation_status`
- gestione di dati incompleti
- gestione di mismatch identita'
- gestione di insufficient contact data
- trace di provenance campo-per-campo
- applicazione corretta degli esiti di verifica esterna
- assenza di promozione indebita a `ready`

Quando crescono le superfici:
- testare anche assenza di leakage nei log
- rifiuto di input incoerenti
- auditabilita' dei merge
- sicurezza degli export o strumenti manuali

Priorita' alta a:
- provenance
- determinismo
- boundary clarity
- spiegabilita'
- minimizzazione dei dati
- coerenza degli status

---

## Commit policy

Prima di ogni commit:
1. ispeziona il diff
2. esegui almeno i test o check minimi pertinenti
3. esegui secret scanning sui cambi staged
4. verifica che la slice sia coerente e non contenga cambi non correlati

Non fare commit se:
- i test minimi falliscono
- ci sono artefatti locali o file temporanei
- il working tree contiene cambi non correlati che sporcano la slice
- sono stati rilevati segreti o dati esposti

Non pushare automaticamente se non richiesto esplicitamente.

Preferire commit piccoli, semantici e reviewable.

---

## Secret safety policy

Prima di ogni commit, eseguire secret scanning sui cambi staged.

Se viene rilevato un segreto o dato esposto:
- fermarsi immediatamente
- non creare il commit
- stampare:
  - file path
  - line number
  - matched rule / secret type

Non committare mai:
- `.env`
- API keys
- tokens
- private keys
- dump locali con dati contatto completi non necessari
- file di debug con payload sensibili
- credenziali DB o credenziali per adapter esterni
- file temporanei contenenti dati personali o operativi sensibili

Se un segreto e' gia' esposto:
- raccomandare rimozione
- spostamento su env / secret manager
- rotazione se necessario

Non bypassare i controlli se non in caso di falso positivo esplicitamente verificato.

---

## Way of working

Quando modifichi il repo:
1. resta dentro il boundary
2. privilegia chiarezza e provenance
3. evita astrazioni premature
4. evita monorepo impliciti
5. non introdurre dipendenze con altri repo
6. mantieni il codice piccolo, diffabile e spiegabile
7. non trasformare il layer in execution engine
8. non trasformare il layer in scoring engine
9. se tocchi matching o precedence, esplicita sempre l'invariante preservato
10. se allarghi una superficie sensibile, esplicita il boundary di sicurezza che stai assumendo

---

## Documentation map

Usa questi file come riferimento:
- `docs/architecture-note.md`
- `README.md`
- `migrations/001_init.sql`

Se un comportamento non e' chiaramente dentro questo boundary, non implementarlo.

Se il codice entra in tensione con la nota architetturale, la direzione architetturale vince sulla scorciatoia implementativa.

---

## Architectural binding sentence

**Questo repo fonde sorgenti eterogenee con precedence esplicite e provenance campo-per-campo per produrre record reminder preparati, tracciabili e spiegabili. Non esegue comunicazioni, non canonizza eventi, non decide responsabilita' e non assorbe la semantica dei layer vicini.**
