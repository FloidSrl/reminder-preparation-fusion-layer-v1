import assert from 'node:assert/strict';

import { buildPreparedRecordV1 } from '../application/buildPreparedRecordV1.js';
import { emitCommunicationIntentV1 } from '../application/emitCommunicationIntentV1.js';
import { evaluateReminderRevisionV1 } from '../application/evaluateReminderRevisionV1.js';
import { prepareReminderRevisionCaseV1 } from '../application/prepareReminderRevisionCaseV1.js';
import { goldenScenariosV1 } from './goldenScenariosV1.js';

for (const scenario of goldenScenariosV1) {
    const evaluation = evaluateReminderRevisionV1(scenario.input);
    const preparedRecord = buildPreparedRecordV1(scenario.input, evaluation);
    const intentResult = emitCommunicationIntentV1(scenario.input, preparedRecord);
    const preparedCase = prepareReminderRevisionCaseV1(scenario.input);

    assert.equal(evaluation.readiness_status, scenario.expected.readiness_status);
    assert.deepEqual(evaluation.blocking_reasons, scenario.expected.blocking_reasons);
    assert.deepEqual(evaluation.review_reasons, scenario.expected.review_reasons);
    assert.deepEqual(evaluation.warnings, scenario.expected.warnings);
    assert.equal(evaluation.due_context.due_basis, scenario.expected.due_basis);
    assert.equal(
        evaluation.due_context.due_precision,
        scenario.expected.due_precision,
    );
    assert.equal(
        intentResult.intent !== null,
        scenario.expected.emits_communication_intent,
    );
    assert.deepEqual(preparedCase.preparedRecord, preparedRecord);
    assert.equal(
        preparedCase.communicationIntent !== undefined,
        scenario.expected.emits_communication_intent,
    );

    if (intentResult.intent) {
        assert.equal(
            intentResult.intent.payload.prepared_record_ref,
            preparedRecord.prepared_record_id,
        );
        assert.equal(
            intentResult.intent.idempotency_key,
            intentResult.idempotency_key,
        );
        assert.deepEqual(preparedCase.communicationIntent, intentResult.intent);
    }

    console.log(
        JSON.stringify(
            {
                scenario_id: scenario.scenario_id,
                readiness_status: evaluation.readiness_status,
                blocking_reasons: evaluation.blocking_reasons,
                review_reasons: evaluation.review_reasons,
                warnings: evaluation.warnings,
                due_context: evaluation.due_context,
                prepared_key: preparedRecord.prepared_key,
                dedupe_key: preparedRecord.dedupe_key,
                idempotency_key: intentResult.idempotency_key,
                emits_communication_intent: intentResult.intent !== null,
            },
            null,
            2,
        ),
    );
}

{
    const baseline = goldenScenariosV1[0];

    if (!baseline) {
        throw new Error('expected at least one golden scenario');
    }

    const firstEvaluation = evaluateReminderRevisionV1(baseline.input);
    const secondEvaluation = evaluateReminderRevisionV1({
        ...baseline.input,
        preparation_evaluation_id: 'eval|rerun',
        prepared_record_id: 'prepared|rerun',
    });

    const firstPrepared = buildPreparedRecordV1(baseline.input, firstEvaluation);
    const secondPrepared = buildPreparedRecordV1(
        {
            ...baseline.input,
            preparation_evaluation_id: 'eval|rerun',
            prepared_record_id: 'prepared|rerun',
        },
        secondEvaluation,
    );

    assert.equal(firstPrepared.prepared_key, secondPrepared.prepared_key);
}

{
    const recipientOverride = {
        ...goldenScenariosV1[0]!.input,
        recipient_candidates: [
            {
                candidate_id: 'candidate-owner-001',
                role: 'registered_owner' as const,
                confidence: 'high' as const,
            },
        ],
        resolved_recipient: {
            subject_ref: 'subject-owner-001',
            recipient_role: 'user' as const,
            resolution_basis: 'owner_retained' as const,
            confidence: 'high' as const,
        },
        policy_flags: {
            requires_postal_fallback: true,
        },
    };

    const result = prepareReminderRevisionCaseV1(recipientOverride);

    assert.equal(result.communicationIntent?.recipient.recipient_role, 'user');
    assert.equal(
        result.communicationIntent?.policy_flags?.requires_postal_fallback,
        true,
    );
}

console.log(`Reminder revision v1 golden scenarios passed: ${goldenScenariosV1.length}`);
