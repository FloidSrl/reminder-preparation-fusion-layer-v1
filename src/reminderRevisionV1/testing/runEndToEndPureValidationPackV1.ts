import assert from 'node:assert/strict';

import { mapEchoesToReminderRevisionCaseV1 } from '../adapters/echoes/mapEchoesToReminderRevisionCaseV1.js';
import { mapCommunicationIntentToRevifyRequestV1 } from '../adapters/revify/mapCommunicationIntentToRevifyRequestV1.js';
import { prepareReminderRevisionCaseV1 } from '../application/prepareReminderRevisionCaseV1.js';
import { endToEndPureValidationPackV1 } from './endToEndPureValidationPackV1.js';

for (const scenario of endToEndPureValidationPackV1) {
    const mappedCase = mapEchoesToReminderRevisionCaseV1(scenario.fixture.adapter_input);
    const prepared = prepareReminderRevisionCaseV1(mappedCase);
    const intent = prepared.communicationIntent;
    const revifyRequest = intent
        ? mapCommunicationIntentToRevifyRequestV1(intent)
        : undefined;

    switch (scenario.scenario_id) {
        case 'echoes_realistic_ready_clean_revision_due': {
            assert.equal(prepared.preparedRecord.readiness_status, 'ready');
            assert.equal(intent !== undefined, true);
            assert.equal(revifyRequest !== undefined, true);
            assert.equal(revifyRequest?.intent_ref, intent?.communication_intent_id);
            assert.equal(
                revifyRequest?.prepared_record_ref,
                prepared.preparedRecord.prepared_record_id,
            );
            break;
        }

        case 'echoes_realistic_extracted_due_with_mixed_addressing': {
            assert.equal('warnings' in mappedCase, false);
            assert.equal(prepared.preparedRecord.readiness_status, 'ready_with_warnings');
            assert.deepEqual(prepared.preparedRecord.warnings, ['mixed_source_addressing']);
            assert.equal(intent !== undefined, true);
            assert.equal(revifyRequest !== undefined, true);
            assert.equal('readiness_status' in (revifyRequest ?? {}), false);
            assert.equal('intent_reason' in (revifyRequest ?? {}), false);
            break;
        }

        case 'echoes_realistic_artifact_only_without_due_fact': {
            assert.equal(prepared.preparedRecord.readiness_status, 'not_ready');
            assert.equal(intent, undefined);
            assert.equal(revifyRequest, undefined);
            break;
        }

        case 'echoes_realistic_conflict_between_observation_and_external_due': {
            assert.equal(prepared.preparedRecord.readiness_status, 'manual_review_required');
            assert.deepEqual(prepared.preparedRecord.review_reasons, ['due_context_conflict']);
            assert.equal(intent, undefined);
            assert.equal(revifyRequest, undefined);
            break;
        }

        case 'echoes_realistic_duplicate_relation_requires_core_decision': {
            assert.equal(mappedCase.duplicate_state, 'duplicate');
            assert.equal('blocking_reasons' in mappedCase, false);
            assert.equal(prepared.preparedRecord.readiness_status, 'blocked');
            assert.deepEqual(prepared.preparedRecord.blocking_reasons, [
                'duplicate_or_superseded_unresolved',
            ]);
            assert.equal(intent, undefined);
            assert.equal(revifyRequest, undefined);
            break;
        }

        default:
            throw new Error(`Unhandled end-to-end validation scenario: ${scenario.scenario_id}`);
    }

    console.log(
        JSON.stringify(
            {
                scenario_id: scenario.scenario_id,
                mapped_observation_fact_types: mappedCase.observations.map(
                    (observation) => observation.fact_type,
                ),
                duplicate_state: mappedCase.duplicate_state,
                readiness_status: prepared.preparedRecord.readiness_status,
                warnings: prepared.preparedRecord.warnings,
                review_reasons: prepared.preparedRecord.review_reasons,
                emits_communication_intent: intent !== undefined,
                emits_revify_request: revifyRequest !== undefined,
            },
            null,
            2,
        ),
    );
}

console.log(
    `End-to-end pure validation scenarios passed: ${endToEndPureValidationPackV1.length}`,
);
