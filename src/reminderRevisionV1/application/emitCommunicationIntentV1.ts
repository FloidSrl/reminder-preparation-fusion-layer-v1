import type {
    CommunicationIntent,
    PreparedRecord,
} from '../domain/contracts.js';
import type {
    EmitCommunicationIntentResultV1,
    ReminderRevisionCaseV1,
} from '../domain/types.js';

export function emitCommunicationIntentV1(
    input: ReminderRevisionCaseV1,
    preparedRecord: PreparedRecord,
): EmitCommunicationIntentResultV1 {
    if (
        preparedRecord.readiness_status !== 'ready' &&
        preparedRecord.readiness_status !== 'ready_with_warnings'
    ) {
        return {
            intent: null,
            idempotency_key: null,
        };
    }

    if (
        input.resolved_recipient === null ||
        preparedRecord.resolved_recipient.subject_ref === null ||
        preparedRecord.resolved_addressing === null
    ) {
        return {
            intent: null,
            idempotency_key: null,
        };
    }

    const channels = deriveChannels(input, preparedRecord);

    if (channels.length === 0) {
        return {
            intent: null,
            idempotency_key: null,
        };
    }

    const idempotency_key = [
        'intent',
        preparedRecord.prepared_key,
        channels.join('+'),
    ].join('|');
    const policyFlags = buildPolicyFlags(input);
    const intent: CommunicationIntent = {
        communication_intent_id: `intent|${preparedRecord.prepared_record_id}`,
        intent_type: 'reminder_revision_v1',
        intent_reason: preparedRecord.readiness_status,
        recipient: {
            subject_ref: preparedRecord.resolved_recipient.subject_ref,
            recipient_role: input.resolved_recipient.recipient_role,
        },
        channels,
        addressing: {
            postal_address: preparedRecord.resolved_addressing.postal_address,
            digital_address: preparedRecord.resolved_addressing.digital_address,
            addressing_basis: preparedRecord.resolved_addressing.addressing_basis,
        },
        payload: {
            prepared_record_ref: preparedRecord.prepared_record_id,
            reminder_context: {
                projected_due_at: preparedRecord.projected_due_at,
                due_basis: preparedRecord.revision_context.due_context.due_basis,
                due_precision: preparedRecord.revision_context.due_context.due_precision,
            },
        },
        priority:
            preparedRecord.readiness_status === 'ready_with_warnings'
                ? 'normal'
                : 'high',
        idempotency_key,
        created_at: preparedRecord.generated_at,
    };

    if (policyFlags) {
        intent.policy_flags = policyFlags;
    }

    return {
        idempotency_key,
        intent,
    };
}

function deriveChannels(
    input: ReminderRevisionCaseV1,
    preparedRecord: PreparedRecord,
): Array<'postal' | 'pec' | 'email' | 'sms'> {
    const channels: Array<'postal' | 'pec' | 'email' | 'sms'> = [];

    if (
        preparedRecord.resolved_addressing?.digital_address &&
        !input.policy_flags?.suppress_digital
    ) {
        channels.push('email');
    }

    if (preparedRecord.resolved_addressing?.postal_address) {
        channels.push('postal');
    }

    return channels;
}

function buildPolicyFlags(
    input: ReminderRevisionCaseV1,
): CommunicationIntent['policy_flags'] | null {
    const policyFlags: CommunicationIntent['policy_flags'] = {};

    if (input.policy_flags?.requires_postal_fallback !== undefined) {
        policyFlags.requires_postal_fallback =
            input.policy_flags.requires_postal_fallback;
    }

    if (input.policy_flags?.suppress_digital !== undefined) {
        policyFlags.suppress_digital = input.policy_flags.suppress_digital;
    }

    if (Object.keys(policyFlags).length === 0) {
        return null;
    }

    return policyFlags;
}
