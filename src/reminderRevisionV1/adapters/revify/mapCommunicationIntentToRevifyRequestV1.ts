import type { CommunicationIntent } from '../../domain/contracts.js';
import type { RevifyRequestV1 } from './types.js';

export function mapCommunicationIntentToRevifyRequestV1(
    intent: CommunicationIntent,
): RevifyRequestV1 {
    const request: RevifyRequestV1 = {
        intent_ref: intent.communication_intent_id,
        prepared_record_ref: intent.payload.prepared_record_ref,
        use_case: 'reminder_revisione_v1',
        recipient: intent.recipient,
        channels: intent.channels,
        addressing: intent.addressing,
        content_context: intent.payload.reminder_context,
        idempotency_key: intent.idempotency_key,
        created_at: intent.created_at,
    };

    if (intent.policy_flags !== undefined) {
        request.policy_flags = intent.policy_flags;
    }

    return request;
}
