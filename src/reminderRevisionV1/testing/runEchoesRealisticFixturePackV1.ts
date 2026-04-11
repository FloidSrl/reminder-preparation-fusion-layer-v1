import assert from 'node:assert/strict';

import { mapEchoesToReminderRevisionCaseV1 } from '../adapters/echoes/mapEchoesToReminderRevisionCaseV1.js';
import { prepareReminderRevisionCaseV1 } from '../application/prepareReminderRevisionCaseV1.js';
import { echoesRealisticFixturePackV1 } from './echoesRealisticFixturePackV1.js';

for (const fixture of echoesRealisticFixturePackV1) {
    const mappedCase = mapEchoesToReminderRevisionCaseV1(fixture.adapter_input);
    const prepared = prepareReminderRevisionCaseV1(mappedCase);

    switch (fixture.scenario_id) {
        case 'echoes_realistic_ready_clean_revision_due': {
            assert.equal(mappedCase.duplicate_state, 'unique');
            assert.equal(mappedCase.resolved_recipient?.subject_ref, 'owner-001');
            assert.equal(prepared.preparedRecord.readiness_status, 'ready');
            assert.equal(prepared.communicationIntent !== undefined, true);
            break;
        }

        case 'echoes_realistic_extracted_due_with_mixed_addressing': {
            assert.equal(mappedCase.resolved_addressing?.addressing_basis, 'mixed');
            assert.equal('warnings' in mappedCase, false);
            assert.deepEqual(prepared.preparedRecord.warnings, ['mixed_source_addressing']);
            assert.equal(prepared.preparedRecord.readiness_status, 'ready_with_warnings');
            assert.equal(prepared.communicationIntent !== undefined, true);
            break;
        }

        case 'echoes_realistic_artifact_only_without_due_fact': {
            assert.deepEqual(
                mappedCase.observations.map((observation) => observation.fact_type),
                ['artifact_presence_signal', 'vehicle_identity_fact'],
            );
            assert.equal(prepared.preparedRecord.revision_context.due_context.due_at, null);
            assert.equal(prepared.preparedRecord.readiness_status, 'not_ready');
            assert.equal(prepared.communicationIntent, undefined);
            break;
        }

        case 'echoes_realistic_duplicate_relation_requires_core_decision': {
            assert.equal(mappedCase.duplicate_state, 'duplicate');
            assert.equal('blocking_reasons' in mappedCase, false);
            assert.deepEqual(prepared.preparedRecord.blocking_reasons, [
                'duplicate_or_superseded_unresolved',
            ]);
            assert.equal(prepared.preparedRecord.readiness_status, 'blocked');
            assert.equal(prepared.communicationIntent, undefined);
            break;
        }

        case 'echoes_realistic_ignores_named_out_of_profile_fact_types': {
            assert.deepEqual(
                mappedCase.observations.map((observation) => observation.fact_type),
                ['registered_owner_fact', 'revision_due_fact'],
            );
            assert.equal(mappedCase.vehicle_identity.plate, null);
            assert.equal(prepared.preparedRecord.readiness_status, 'ready');
            assert.equal(prepared.communicationIntent !== undefined, true);
            break;
        }

        case 'echoes_realistic_conflict_between_observation_and_external_due': {
            assert.equal(mappedCase.observations.some((observation) => observation.fact_type === 'extracted_due_fact'), true);
            assert.equal(mappedCase.external_due_contributions.length, 1);
            assert.equal(prepared.preparedRecord.readiness_status, 'manual_review_required');
            assert.deepEqual(prepared.preparedRecord.review_reasons, ['due_context_conflict']);
            assert.equal(prepared.communicationIntent, undefined);
            break;
        }

        case 'echoes_realistic_due_present_but_recipient_unresolved': {
            assert.equal(mappedCase.resolved_recipient, null);
            assert.equal(mappedCase.recipient_candidates.length, 1);
            assert.equal(prepared.preparedRecord.readiness_status, 'blocked');
            assert.deepEqual(prepared.preparedRecord.blocking_reasons, [
                'recipient_unresolved',
            ]);
            assert.equal(prepared.communicationIntent, undefined);
            break;
        }

        default:
            throw new Error(`Unhandled realistic fixture scenario: ${fixture.scenario_id}`);
    }

    console.log(
        JSON.stringify(
            {
                scenario_id: fixture.scenario_id,
                mapped_observation_fact_types: mappedCase.observations.map(
                    (observation) => observation.fact_type,
                ),
                duplicate_state: mappedCase.duplicate_state,
                readiness_status: prepared.preparedRecord.readiness_status,
                blocking_reasons: prepared.preparedRecord.blocking_reasons,
                review_reasons: prepared.preparedRecord.review_reasons,
                warnings: prepared.preparedRecord.warnings,
                emits_communication_intent: prepared.communicationIntent !== undefined,
            },
            null,
            2,
        ),
    );
}

console.log(
    `Echoes realistic fixture pack scenarios passed: ${echoesRealisticFixturePackV1.length}`,
);
