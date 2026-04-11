import type { CommunicationIntent } from '../../domain/contracts.js';

export interface RevifyRequestV1 {
    intent_ref: CommunicationIntent['communication_intent_id'];
    prepared_record_ref: CommunicationIntent['payload']['prepared_record_ref'];
    use_case: 'reminder_revisione_v1';
    recipient: CommunicationIntent['recipient'];
    channels: CommunicationIntent['channels'];
    addressing: CommunicationIntent['addressing'];
    content_context: CommunicationIntent['payload']['reminder_context'];
    idempotency_key: CommunicationIntent['idempotency_key'];
    created_at: CommunicationIntent['created_at'];
    policy_flags?: CommunicationIntent['policy_flags'];
}
