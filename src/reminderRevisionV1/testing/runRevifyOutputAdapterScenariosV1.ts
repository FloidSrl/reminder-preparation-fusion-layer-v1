import assert from 'node:assert/strict';

import { mapCommunicationIntentToRevifyRequestV1 } from '../adapters/revify/mapCommunicationIntentToRevifyRequestV1.js';
import { prepareReminderRevisionCaseV1 } from '../application/prepareReminderRevisionCaseV1.js';
import type { CommunicationIntent } from '../domain/contracts.js';
import { goldenScenariosV1 } from './goldenScenariosV1.js';

const baselineInput = goldenScenariosV1[0]?.input;

if (!baselineInput) {
    throw new Error('expected at least one golden scenario');
}

{
    const result = prepareReminderRevisionCaseV1({
        ...baselineInput,
        preparation_evaluation_id: 'eval|revify-ready-001',
        prepared_record_id: 'prepared|revify-ready-001',
        resolved_recipient: {
            subject_ref: 'subject-001',
            recipient_role: 'registered_owner',
            resolution_basis: 'owner_retained',
            confidence: 'high',
        },
        resolved_addressing: {
            postal_address: {
                line1: 'Via Roma 1',
                city: 'Roma',
            },
            digital_address: {
                email: 'mario.rossi@example.com',
            },
            addressing_basis: 'mixed',
            confidence: 'high',
        },
        policy_flags: {
            requires_postal_fallback: true,
            suppress_digital: false,
        },
    });

    const intent = result.communicationIntent;

    if (!intent) {
        throw new Error('expected communication intent for revify mapping scenario');
    }

    const request = mapCommunicationIntentToRevifyRequestV1(intent);

    assert.equal(request.intent_ref, intent.communication_intent_id);
    assert.equal(request.idempotency_key, intent.idempotency_key);
    assert.equal(request.prepared_record_ref, intent.payload.prepared_record_ref);
    assert.equal(request.use_case, 'reminder_revisione_v1');
    assert.deepEqual(request.recipient, intent.recipient);
    assert.deepEqual(request.addressing, intent.addressing);
    assert.deepEqual(request.channels, intent.channels);
    assert.deepEqual(request.policy_flags, intent.policy_flags);
    assert.deepEqual(request.content_context, {
        projected_due_at: intent.payload.reminder_context.projected_due_at,
        due_basis: intent.payload.reminder_context.due_basis,
        due_precision: intent.payload.reminder_context.due_precision,
    });
    assert.equal('request_id' in request, false);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'revify_output_maps_closed_intent_without_reinterpretation',
                intent_ref: request.intent_ref,
                idempotency_key: request.idempotency_key,
                channels: request.channels,
                addressing_basis: request.addressing.addressing_basis,
                policy_flags: request.policy_flags,
            },
            null,
            2,
        ),
    );
}

{
    const intent: CommunicationIntent = {
        communication_intent_id: 'intent|manual-001',
        intent_type: 'reminder_revision_v1',
        intent_reason: 'ready',
        recipient: {
            subject_ref: 'subject-manual-001',
            recipient_role: 'user',
        },
        channels: ['pec', 'sms', 'postal'],
        addressing: {
            postal_address: {
                line1: 'Via Milano 7',
                city: 'Milano',
            },
            digital_address: {
                pec: 'utente@examplepec.it',
                phone: '+3900000000',
            },
            addressing_basis: 'mixed',
        },
        payload: {
            prepared_record_ref: 'prepared|manual-001',
            reminder_context: {
                projected_due_at: '2026-05-15',
                due_basis: 'extracted_fact',
                due_precision: 'exact_day',
            },
        },
        priority: 'high',
        idempotency_key: 'intent|prepared|manual-001|pec+sms+postal',
        created_at: '2026-04-11T10:01:01Z',
    };

    const request = mapCommunicationIntentToRevifyRequestV1(intent);

    assert.deepEqual(request.channels, ['pec', 'sms', 'postal']);
    assert.deepEqual(request.recipient, intent.recipient);
    assert.deepEqual(request.addressing, intent.addressing);
    assert.equal(request.policy_flags, undefined);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'revify_output_keeps_channels_and_does_not_invent_policy_flags',
                channels: request.channels,
                recipient: request.recipient,
                has_policy_flags: request.policy_flags !== undefined,
            },
            null,
            2,
        ),
    );
}

{
    const warningInput = {
        ...baselineInput,
        preparation_evaluation_id: 'eval|revify-warning-001',
        prepared_record_id: 'prepared|revify-warning-001',
        resolved_recipient: {
            subject_ref: 'subject-warning-001',
            recipient_role: 'registered_owner' as const,
            resolution_basis: 'owner_retained' as const,
            confidence: 'high' as const,
        },
        resolved_addressing: {
            postal_address: {
                line1: 'Via Torino 3',
                city: 'Torino',
            },
            digital_address: null,
            addressing_basis: 'direct' as const,
            confidence: 'medium' as const,
        },
        policy_flags: {
            requires_postal_fallback: true,
        },
    };

    const result = prepareReminderRevisionCaseV1(warningInput);
    const intent = result.communicationIntent;

    if (!intent) {
        throw new Error('expected communication intent for warning mapping scenario');
    }

    const request = mapCommunicationIntentToRevifyRequestV1(intent);

    assert.equal(request.intent_ref, intent.communication_intent_id);
    assert.equal(request.prepared_record_ref, result.preparedRecord.prepared_record_id);
    assert.deepEqual(request.content_context, intent.payload.reminder_context);
    assert.equal('readiness_status' in request, false);
    assert.equal('intent_reason' in request, false);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'revify_output_does_not_recompute_readiness',
                prepared_readiness_status: result.preparedRecord.readiness_status,
                intent_reason: intent.intent_reason,
                exports_readiness_status: 'readiness_status' in request,
                exports_intent_reason: 'intent_reason' in request,
                content_context: request.content_context,
            },
            null,
            2,
        ),
    );
}

console.log('Revify output adapter scenarios passed: 3');
