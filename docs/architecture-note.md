# Architecture Note

## Catena v1

`Echoes -> Preparation / Fusion -> Revify`

Use case unico:

- `reminder revisione v1`

## Ruolo dei moduli

`Echoes`

- riceve observation
- valida e persiste intake
- conserva trace e lineage
- espone fatti osservativi e riferimenti strutturati

Non fa:

- readiness
- recipient resolution reminder
- communication execution

`Preparation / Fusion`

- legge `ObservationInput`
- integra contributi esterni stretti
- compone il caso reminder revisione
- risolve `resolved_recipient`
- risolve `resolved_addressing`
- valuta `readiness_status`
- produce `PreparedRecord`
- produce `CommunicationIntent` solo se il caso e pronto
- espone un adapter puro di uscita che rimappa `CommunicationIntent` in `RevifyRequestV1`

Non fa:

- execution
- canonical eventing
- interpretation generalista
- workflow orchestration

`Revify`

- consuma `RevifyRequestV1`
- esegue la comunicazione
- emette `CommunicationObservation`

Non fa:

- readiness
- recipient resolution
- semantica reminder

## Boundary Reminder

La semantica reminder non deve stare:

- in Echoes, perche Echoes osserva
- in Revify, perche Revify esegue

La semantica reminder minima vive nel Preparation Layer, che e il punto in cui observation eterogenee diventano un caso valutato e spiegabile.

## Regole prescrittive

- `ObservationInput` resta non semantic reminder
- `PreparedRecord` e l artefatto centrale del layer
- `CommunicationIntent` e il solo output eseguibile del nucleo Preparation
- `RevifyRequestV1` e il payload minimale rimappato dall adapter di uscita
- `source_trace` contiene riferimenti strutturati, non payload grezzi
- `resolved_recipient` e `resolved_addressing` non si fondono
- i fatti osservativi estratti e validati prevalgono sui meri segnali di presenza artifact quando insistono sullo stesso aspetto semantico
