import type { PreparedRecord } from '../domain/contracts.js';
import type {
    ReminderRevisionCaseV1,
    ReminderRevisionEvaluationV1,
} from '../domain/types.js';

export function buildPreparedRecordV1(
    input: ReminderRevisionCaseV1,
    evaluation: ReminderRevisionEvaluationV1,
): PreparedRecord {
    const prepared_key = buildPreparedKey(input, evaluation);
    const dedupe_key = buildDedupeKey(input);

    return {
        preparation_evaluation_id: input.preparation_evaluation_id,
        prepared_record_id: input.prepared_record_id,
        prepared_key,
        source_contract_version: input.source_contract_version,
        source_trace: {
            observation_refs: input.observations.map((observation) => ({
                observation_id: observation.observation_id,
                fact_type: observation.fact_type,
                relevance: evaluation.winning_due_observation_ids.includes(
                    observation.observation_id,
                )
                    ? 'primary'
                    : 'supporting',
            })),
            external_refs: input.external_due_contributions.map((contribution) => ({
                ref_type: 'due_contribution',
                ref_id: contribution.ref_id,
                relevance: evaluation.winning_external_due_refs.includes(
                    contribution.ref_id,
                )
                    ? 'primary'
                    : 'supporting',
            })),
            precedence_decisions: [...evaluation.precedence_decisions],
        },
        subject_identity: {
            registered_owner: input.registered_owner,
            final_subject: input.final_subject,
        },
        vehicle_identity: { ...input.vehicle_identity },
        revision_context: {
            due_context: { ...evaluation.due_context },
            duplicate_state: input.duplicate_state,
        },
        recipient_candidates: input.recipient_candidates.map((candidate) => ({
            ...candidate,
        })),
        resolved_recipient: input.resolved_recipient
            ? {
                  subject_ref: input.resolved_recipient.subject_ref,
                  resolution_basis: input.resolved_recipient.resolution_basis,
                  confidence: input.resolved_recipient.confidence,
              }
            : {
                  subject_ref: null,
                  resolution_basis: 'manual_none',
                  confidence: 'low',
              },
        resolved_addressing: input.resolved_addressing
            ? {
                  postal_address: input.resolved_addressing.postal_address,
                  digital_address: input.resolved_addressing.digital_address,
                  addressing_basis: input.resolved_addressing.addressing_basis,
                  confidence: input.resolved_addressing.confidence,
              }
            : null,
        readiness_status: evaluation.readiness_status,
        blocking_reasons: [...evaluation.blocking_reasons],
        review_reasons: [...evaluation.review_reasons],
        warnings: [...evaluation.warnings],
        projected_due_at: evaluation.due_context.due_at,
        campaign_semantics: {
            use_case: 'reminder_revisione_v1',
        },
        dedupe_key,
        created_at: input.created_at,
        generated_at: input.generated_at,
    };
}

function buildPreparedKey(
    input: ReminderRevisionCaseV1,
    evaluation: ReminderRevisionEvaluationV1,
): string {
    const signature = stableSerialize({
        use_case: 'reminder_revisione_v1',
        vehicle_identity: input.vehicle_identity,
        revision_context: {
            due_context: evaluation.due_context,
            duplicate_state: input.duplicate_state,
        },
        resolved_recipient: input.resolved_recipient
            ? {
                  subject_ref: input.resolved_recipient.subject_ref,
                  recipient_role: input.resolved_recipient.recipient_role,
                  resolution_basis: input.resolved_recipient.resolution_basis,
              }
            : null,
        resolved_addressing: input.resolved_addressing
            ? {
                  postal_address: input.resolved_addressing.postal_address,
                  digital_address: input.resolved_addressing.digital_address,
                  addressing_basis: input.resolved_addressing.addressing_basis,
              }
            : null,
        readiness_status: evaluation.readiness_status,
        blocking_reasons: [...evaluation.blocking_reasons].sort(),
        review_reasons: [...evaluation.review_reasons].sort(),
        warnings: [...evaluation.warnings].sort(),
    });

    return `prepared|${signature}`;
}

function buildDedupeKey(input: ReminderRevisionCaseV1): string {
    const ownerSubjectRef =
        typeof input.registered_owner?.subject_ref === 'string'
            ? input.registered_owner.subject_ref
            : 'no-owner';

    return [
        'dedupe',
        'reminder_revisione_v1',
        input.vehicle_identity.plate ?? 'no-plate',
        ownerSubjectRef,
    ].join('|');
}

function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(
            ([left], [right]) => left.localeCompare(right),
        );

        return `{${entries
            .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
            .join(',')}}`;
    }

    return JSON.stringify(value);
}
