export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ObservationInput {
    observation_id: string;
    idempotency_key?: string;
    source_system: string;
    source_adapter: string;
    source_domain: string;
    observed_at: string;
    ingested_at: string;
    asset_ref: string;
    case_candidate_ref?: string;
    document_ref?: string;
    evidence_ref?: string;
    fact_type: string;
    fact_payload: Record<string, unknown>;
    confidence: ConfidenceLevel;
    correlation_keys: {
        vehicle_plate?: string;
        registry_subject_key?: string;
        document_number?: string;
        external_case_key?: string;
    };
    lineage_anchors: {
        source_batch_id?: string;
        source_row_key?: string;
        extraction_id?: string;
        parser_run_id?: string;
    };
}

export type ExternalRefType =
    | 'recipient_registry'
    | 'verification'
    | 'address_enrichment'
    | 'due_contribution';

export interface PreparedRecord {
    preparation_evaluation_id: string;
    prepared_record_id: string;
    prepared_key: string;
    source_contract_version: string;
    source_trace: {
        observation_refs: Array<{
            observation_id: string;
            fact_type: string;
            relevance: 'primary' | 'supporting';
        }>;
        external_refs: Array<{
            ref_type: ExternalRefType;
            ref_id: string;
            relevance: 'primary' | 'supporting';
        }>;
        precedence_decisions: Array<{
            aspect: 'due_context' | 'recipient' | 'addressing' | 'duplicate_resolution';
            winner_type: 'observed_fact' | 'external_contribution' | 'derived_value';
            rationale: string;
        }>;
    };
    subject_identity: {
        registered_owner: Record<string, unknown> | null;
        final_subject: Record<string, unknown> | null;
    };
    vehicle_identity: {
        plate: string | null;
        vehicle_type: string | null;
    };
    revision_context: {
        due_context: {
            due_at: string | null;
            due_basis: 'registry_document' | 'extracted_fact' | 'derived_rule' | null;
            due_precision: 'exact_day' | 'month_only' | 'coarse' | null;
        };
        duplicate_state: 'unique' | 'duplicate' | 'superseded' | 'unresolved';
    };
    recipient_candidates: Array<{
        candidate_id: string;
        role: 'registered_owner' | 'lessee' | 'user' | 'other';
        confidence: ConfidenceLevel;
    }>;
    resolved_recipient: {
        subject_ref: string | null;
        resolution_basis: 'owner_retained' | 'lessee_resolved' | 'manual_none';
        confidence: ConfidenceLevel;
    };
    resolved_addressing: {
        postal_address: Record<string, unknown> | null;
        digital_address: Record<string, unknown> | null;
        addressing_basis: 'direct' | 'enriched' | 'mixed';
        confidence: ConfidenceLevel;
    } | null;
    readiness_status:
        | 'ready'
        | 'ready_with_warnings'
        | 'not_ready'
        | 'blocked'
        | 'manual_review_required';
    blocking_reasons: string[];
    review_reasons: string[];
    warnings: string[];
    projected_due_at: string | null;
    campaign_semantics: {
        use_case: 'reminder_revisione_v1';
    };
    dedupe_key: string;
    created_at: string;
    generated_at: string;
}

export interface CommunicationIntent {
    communication_intent_id: string;
    intent_type: 'reminder_revision_v1';
    intent_reason: 'ready' | 'ready_with_warnings';
    recipient: {
        subject_ref: string;
        recipient_role: 'registered_owner' | 'lessee' | 'user';
    };
    channels: Array<'postal' | 'pec' | 'email' | 'sms'>;
    addressing: {
        postal_address: Record<string, unknown> | null;
        digital_address: Record<string, unknown> | null;
        addressing_basis: 'direct' | 'enriched' | 'mixed';
    };
    payload: {
        prepared_record_ref: string;
        reminder_context: {
            projected_due_at: string | null;
            due_basis: 'registry_document' | 'extracted_fact' | 'derived_rule' | null;
            due_precision: 'exact_day' | 'month_only' | 'coarse' | null;
        };
    };
    priority: 'low' | 'normal' | 'high';
    idempotency_key: string;
    created_at: string;
    requested_execution_window?: Record<string, unknown>;
    policy_flags?: {
        requires_postal_fallback?: boolean;
        suppress_digital?: boolean;
    };
}

export interface CommunicationObservation {
    communication_observation_id: string;
    communication_intent_ref: string;
    execution_status: 'accepted' | 'queued' | 'delivered' | 'failed' | 'read' | 'clicked';
    observed_at: string;
    channel: 'postal' | 'pec' | 'email' | 'sms';
    technical_payload: Record<string, unknown>;
    provider_ref?: string;
}
