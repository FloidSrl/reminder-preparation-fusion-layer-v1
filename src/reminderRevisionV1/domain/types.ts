import type {
    CommunicationIntent,
    ConfidenceLevel,
    ObservationInput,
    PreparedRecord,
} from './contracts.js';

export type ReadinessStatus = PreparedRecord['readiness_status'];

export type BlockingReason =
    | 'recipient_unresolved'
    | 'addressing_insufficient_or_invalid'
    | 'duplicate_or_superseded_unresolved'
    | 'non_contactable_by_policy'
    | 'evidence_insufficient_hard_stop';

export type ReviewReason =
    | 'recipient_ambiguity'
    | 'source_conflict_unresolved'
    | 'due_context_conflict'
    | 'duplicate_resolution_ambiguous'
    | 'institutional_holder_without_resolved_user';

export type WarningFamily =
    | 'recipient_low_confidence'
    | 'mixed_source_addressing'
    | 'due_precision_reduced'
    | 'partial_but_sufficient_contributions'
    | 'minor_conflict_resolved_by_precedence'
    | 'known_operational_limit';

export interface DueCandidateV1 {
    fact_type: string;
    due_at: string;
    due_basis: 'registry_document' | 'extracted_fact' | 'derived_rule';
    due_precision: 'exact_day' | 'month_only' | 'coarse';
    confidence: ConfidenceLevel;
}

export interface ExternalDueContributionV1 {
    ref_id: string;
    due_candidate: DueCandidateV1;
}

export interface RecipientCandidateV1 {
    candidate_id: string;
    role: 'registered_owner' | 'lessee' | 'user' | 'other';
    confidence: ConfidenceLevel;
}

export interface ResolvedRecipientV1 {
    subject_ref: string;
    recipient_role: 'registered_owner' | 'lessee' | 'user';
    resolution_basis: 'owner_retained' | 'lessee_resolved';
    confidence: ConfidenceLevel;
}

export interface ResolvedAddressingV1 {
    postal_address: Record<string, unknown> | null;
    digital_address: Record<string, unknown> | null;
    addressing_basis: 'direct' | 'enriched' | 'mixed';
    confidence: ConfidenceLevel;
}

export interface ReminderRevisionCaseV1 {
    preparation_evaluation_id: string;
    prepared_record_id: string;
    source_contract_version: string;
    created_at: string;
    generated_at: string;
    observations: ObservationInput[];
    external_due_contributions: ExternalDueContributionV1[];
    registered_owner: Record<string, unknown> | null;
    final_subject: Record<string, unknown> | null;
    vehicle_identity: {
        plate: string | null;
        vehicle_type: string | null;
    };
    recipient_candidates: RecipientCandidateV1[];
    resolved_recipient: ResolvedRecipientV1 | null;
    resolved_addressing: ResolvedAddressingV1 | null;
    duplicate_state: 'unique' | 'duplicate' | 'superseded' | 'unresolved';
    policy_flags?: {
        non_contactable_by_policy?: boolean;
        requires_postal_fallback?: boolean;
        suppress_digital?: boolean;
    };
}

export interface ReminderRevisionEvaluationV1 {
    readiness_status: ReadinessStatus;
    blocking_reasons: BlockingReason[];
    review_reasons: ReviewReason[];
    warnings: WarningFamily[];
    due_context: {
        due_at: string | null;
        due_basis: 'registry_document' | 'extracted_fact' | 'derived_rule' | null;
        due_precision: 'exact_day' | 'month_only' | 'coarse' | null;
    };
    winning_due_observation_ids: string[];
    winning_external_due_refs: string[];
    supporting_due_observation_ids: string[];
    supporting_external_due_refs: string[];
    precedence_decisions: PreparedRecord['source_trace']['precedence_decisions'];
}

export interface EmitCommunicationIntentResultV1 {
    intent: CommunicationIntent | null;
    idempotency_key: string | null;
}

export interface PrepareReminderRevisionCaseResultV1 {
    preparedRecord: PreparedRecord;
    communicationIntent?: CommunicationIntent;
}
