import type { ConfidenceLevel, ObservationInput } from '../domain/contracts.js';
import type {
    ReminderRevisionCaseV1,
    ReviewReason,
    WarningFamily,
} from '../domain/types.js';

export interface GoldenScenarioV1 {
    scenario_id: string;
    use_case: 'reminder_revisione_v1';
    input: ReminderRevisionCaseV1;
    expected: {
        readiness_status:
            | 'ready'
            | 'ready_with_warnings'
            | 'not_ready'
            | 'blocked'
            | 'manual_review_required';
        emits_communication_intent: boolean;
        blocking_reasons: string[];
        review_reasons: ReviewReason[];
        warnings: WarningFamily[];
        due_basis:
            | 'registry_document'
            | 'extracted_fact'
            | 'derived_rule'
            | null;
        due_precision: 'exact_day' | 'month_only' | 'coarse' | null;
    };
}

const now = {
    observed_at: '2026-04-11T10:00:00Z',
    ingested_at: '2026-04-11T10:00:05Z',
    created_at: '2026-04-11T10:01:00Z',
    generated_at: '2026-04-11T10:01:01Z',
};

export const goldenScenariosV1: GoldenScenarioV1[] = [
    {
        scenario_id: 'ready_minimal',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-ready-001', 'revision_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
                buildObservation('obs-ready-002', 'vehicle_identity_fact', 'high', {}),
            ],
        }),
        expected: {
            readiness_status: 'ready',
            emits_communication_intent: true,
            blocking_reasons: [],
            review_reasons: [],
            warnings: [],
            due_basis: 'extracted_fact',
            due_precision: 'exact_day',
        },
    },
    {
        scenario_id: 'ready_with_warnings_mixed_addressing',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-warning-001', 'revision_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            resolved_addressing: {
                postal_address: { line1: 'Via Roma 1' },
                digital_address: { email: 'mario@example.com' },
                addressing_basis: 'mixed',
                confidence: 'medium',
            },
        }),
        expected: {
            readiness_status: 'ready_with_warnings',
            emits_communication_intent: true,
            blocking_reasons: [],
            review_reasons: [],
            warnings: ['mixed_source_addressing'],
            due_basis: 'extracted_fact',
            due_precision: 'exact_day',
        },
    },
    {
        scenario_id: 'blocked_addressing_invalid',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-blocked-001', 'revision_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            resolved_addressing: null,
        }),
        expected: {
            readiness_status: 'blocked',
            emits_communication_intent: false,
            blocking_reasons: ['addressing_insufficient_or_invalid'],
            review_reasons: [],
            warnings: [],
            due_basis: 'extracted_fact',
            due_precision: 'exact_day',
        },
    },
    {
        scenario_id: 'manual_review_recipient_ambiguous',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-review-001', 'registered_owner_fact', 'high', {}),
            ],
            recipient_candidates: [
                { candidate_id: 'owner-001', role: 'registered_owner', confidence: 'medium' },
                { candidate_id: 'lessee-001', role: 'lessee', confidence: 'medium' },
            ],
            resolved_recipient: null,
            resolved_addressing: null,
        }),
        expected: {
            readiness_status: 'manual_review_required',
            emits_communication_intent: false,
            blocking_reasons: [],
            review_reasons: ['recipient_ambiguity'],
            warnings: [],
            due_basis: null,
            due_precision: null,
        },
    },
    {
        scenario_id: 'duplicate_or_superseded_case',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-dup-001', 'revision_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
                buildObservation('obs-dup-002', 'duplicate_relation_fact', 'high', {}),
            ],
            duplicate_state: 'duplicate',
        }),
        expected: {
            readiness_status: 'blocked',
            emits_communication_intent: false,
            blocking_reasons: ['duplicate_or_superseded_unresolved'],
            review_reasons: [],
            warnings: [],
            due_basis: 'extracted_fact',
            due_precision: 'exact_day',
        },
    },
    {
        scenario_id: 'conflict_between_sources_on_due',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-conflict-001', 'artifact_presence_signal', 'medium', {
                    due_at: '2026-05-20',
                    due_basis: 'derived_rule',
                    due_precision: 'coarse',
                }),
                buildObservation('obs-conflict-002', 'extracted_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_due_contributions: [
                {
                    ref_id: 'ext-due-001',
                    due_candidate: {
                        fact_type: 'external_due_fact',
                        due_at: '2026-05-18',
                        due_basis: 'registry_document',
                        due_precision: 'exact_day',
                        confidence: 'medium',
                    },
                },
            ],
        }),
        expected: {
            readiness_status: 'ready_with_warnings',
            emits_communication_intent: true,
            blocking_reasons: [],
            review_reasons: [],
            warnings: ['minor_conflict_resolved_by_precedence'],
            due_basis: 'extracted_fact',
            due_precision: 'exact_day',
        },
    },
    {
        scenario_id: 'not_ready_due_missing_but_open',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-open-001', 'vehicle_identity_fact', 'high', {}),
            ],
        }),
        expected: {
            readiness_status: 'not_ready',
            emits_communication_intent: false,
            blocking_reasons: [],
            review_reasons: [],
            warnings: [],
            due_basis: null,
            due_precision: null,
        },
    },
    {
        scenario_id: 'manual_review_due_conflict',
        use_case: 'reminder_revisione_v1',
        input: buildCase({
            observations: [
                buildObservation('obs-due-review-001', 'extracted_due_fact', 'medium', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_due_contributions: [
                {
                    ref_id: 'ext-due-002',
                    due_candidate: {
                        fact_type: 'external_due_fact',
                        due_at: '2026-05-25',
                        due_basis: 'registry_document',
                        due_precision: 'exact_day',
                        confidence: 'medium',
                    },
                },
            ],
        }),
        expected: {
            readiness_status: 'manual_review_required',
            emits_communication_intent: false,
            blocking_reasons: [],
            review_reasons: ['due_context_conflict'],
            warnings: [],
            due_basis: null,
            due_precision: null,
        },
    },
];

function buildCase(
    overrides: Partial<ReminderRevisionCaseV1>,
): ReminderRevisionCaseV1 {
    return {
        preparation_evaluation_id: `eval|${overrides.preparation_evaluation_id ?? 'base'}`,
        prepared_record_id: `prepared|${overrides.prepared_record_id ?? 'base'}`,
        source_contract_version: 'v1-doc-slice',
        created_at: now.created_at,
        generated_at: now.generated_at,
        observations: [],
        external_due_contributions: [],
        registered_owner: { subject_ref: 'owner-001', display_name: 'Mario Rossi' },
        final_subject: { subject_ref: 'owner-001', display_name: 'Mario Rossi' },
        vehicle_identity: {
            plate: 'AB123CD',
            vehicle_type: 'car',
        },
        recipient_candidates: [
            { candidate_id: 'owner-001', role: 'registered_owner', confidence: 'high' },
        ],
        resolved_recipient: {
            subject_ref: 'owner-001',
            recipient_role: 'registered_owner',
            resolution_basis: 'owner_retained',
            confidence: 'high',
        },
        resolved_addressing: {
            postal_address: { line1: 'Via Roma 1', city: 'Roma' },
            digital_address: null,
            addressing_basis: 'direct',
            confidence: 'high',
        },
        duplicate_state: 'unique',
        ...overrides,
    };
}

function buildObservation(
    observation_id: string,
    fact_type: string,
    confidence: ConfidenceLevel,
    fact_payload: Record<string, unknown>,
): ObservationInput {
    return {
        observation_id,
        source_system: 'echoes',
        source_adapter: 'echoes_edge_rev',
        source_domain: 'reminder_revision_v1',
        observed_at: now.observed_at,
        ingested_at: now.ingested_at,
        asset_ref: `asset|${observation_id}`,
        fact_type,
        fact_payload,
        confidence,
        correlation_keys: {
            vehicle_plate: 'AB123CD',
        },
        lineage_anchors: {
            source_batch_id: 'batch-001',
            source_row_key: observation_id,
        },
    };
}
