import type { ObservationInput } from '../domain/contracts.js';
import type {
    BlockingReason,
    DueCandidateV1,
    ReminderRevisionCaseV1,
    ReminderRevisionEvaluationV1,
    ReviewReason,
    WarningFamily,
} from '../domain/types.js';

const confidenceRank: Record<DueCandidateV1['confidence'], number> = {
    low: 1,
    medium: 2,
    high: 3,
};

export function evaluateReminderRevisionV1(
    input: ReminderRevisionCaseV1,
): ReminderRevisionEvaluationV1 {
    const blocking_reasons: BlockingReason[] = [];
    const review_reasons: ReviewReason[] = [];
    const warnings: WarningFamily[] = [];
    const precedence_decisions: ReminderRevisionEvaluationV1['precedence_decisions'] = [];

    if (
        input.duplicate_state === 'duplicate' ||
        input.duplicate_state === 'superseded' ||
        input.duplicate_state === 'unresolved'
    ) {
        blocking_reasons.push('duplicate_or_superseded_unresolved');
        precedence_decisions.push({
            aspect: 'duplicate_resolution',
            winner_type: 'derived_value',
            rationale: `duplicate_state=${input.duplicate_state} blocks preparation`,
        });
    }

    if (input.policy_flags?.non_contactable_by_policy) {
        blocking_reasons.push('non_contactable_by_policy');
    }

    if (!input.resolved_recipient) {
        if (input.recipient_candidates.length > 1) {
            review_reasons.push('recipient_ambiguity');
        } else {
            blocking_reasons.push('recipient_unresolved');
        }
    } else if (input.resolved_recipient.confidence === 'low') {
        warnings.push('recipient_low_confidence');
    }

    if (!input.resolved_addressing) {
        if (input.resolved_recipient) {
            blocking_reasons.push('addressing_insufficient_or_invalid');
        }
    } else {
        if (
            input.resolved_addressing.postal_address === null &&
            input.resolved_addressing.digital_address === null
        ) {
            blocking_reasons.push('addressing_insufficient_or_invalid');
        }

        if (input.resolved_addressing.addressing_basis === 'mixed') {
            warnings.push('mixed_source_addressing');
        }
    }

    const dueResolution = resolveDueContext(
        input.observations,
        input.external_due_contributions,
    );

    precedence_decisions.push(...dueResolution.precedence_decisions);
    warnings.push(...dueResolution.warnings);

    if (dueResolution.review_reason) {
        review_reasons.push(dueResolution.review_reason);
    }

    if (dueResolution.blocking_reason) {
        blocking_reasons.push(dueResolution.blocking_reason);
    }

    const readiness_status = determineReadinessStatus(
        blocking_reasons,
        review_reasons,
        dueResolution.hasDueContext,
        warnings,
    );

    return {
        readiness_status,
        blocking_reasons: unique(blocking_reasons),
        review_reasons: unique(review_reasons),
        warnings: unique(warnings),
        due_context: dueResolution.due_context,
        winning_due_observation_ids: dueResolution.winning_due_observation_ids,
        winning_external_due_refs: dueResolution.winning_external_due_refs,
        supporting_due_observation_ids: dueResolution.supporting_due_observation_ids,
        supporting_external_due_refs: dueResolution.supporting_external_due_refs,
        precedence_decisions,
    };
}

function determineReadinessStatus(
    blocking_reasons: BlockingReason[],
    review_reasons: ReviewReason[],
    hasDueContext: boolean,
    warnings: WarningFamily[],
): ReminderRevisionEvaluationV1['readiness_status'] {
    if (review_reasons.length > 0) {
        return 'manual_review_required';
    }

    if (blocking_reasons.length > 0) {
        return 'blocked';
    }

    if (!hasDueContext) {
        return 'not_ready';
    }

    return warnings.length > 0 ? 'ready_with_warnings' : 'ready';
}

function resolveDueContext(
    observations: ObservationInput[],
    externalDueContributions: ReminderRevisionCaseV1['external_due_contributions'],
): {
    hasDueContext: boolean;
    due_context: ReminderRevisionEvaluationV1['due_context'];
    winning_due_observation_ids: string[];
    winning_external_due_refs: string[];
    supporting_due_observation_ids: string[];
    supporting_external_due_refs: string[];
    warnings: WarningFamily[];
    review_reason: ReviewReason | null;
    blocking_reason: BlockingReason | null;
    precedence_decisions: ReminderRevisionEvaluationV1['precedence_decisions'];
} {
    const precedence_decisions: ReminderRevisionEvaluationV1['precedence_decisions'] = [];
    const warnings: WarningFamily[] = [];

    const observationCandidates = observations
        .map((observation) => ({
            observation,
            candidate: extractDueCandidate(observation),
        }))
        .filter(
            (item): item is { observation: ObservationInput; candidate: DueCandidateV1 } =>
                item.candidate !== null,
        );
    const externalCandidates = externalDueContributions.map((contribution) => ({
        ref_id: contribution.ref_id,
        candidate: contribution.due_candidate,
    }));

    if (observationCandidates.length === 0 && externalCandidates.length === 0) {
        return {
            hasDueContext: false,
            due_context: {
                due_at: null,
                due_basis: null,
                due_precision: null,
            },
            winning_due_observation_ids: [],
            winning_external_due_refs: [],
            supporting_due_observation_ids: [],
            supporting_external_due_refs: [],
            warnings,
            review_reason: null,
            blocking_reason: null,
            precedence_decisions,
        };
    }

    const extractedCandidates = observationCandidates.filter(
        (item) =>
            item.observation.fact_type === 'revision_due_fact' ||
            item.observation.fact_type === 'extracted_due_fact',
    );
    const artifactCandidates = observationCandidates.filter(
        (item) => item.observation.fact_type === 'artifact_presence_signal',
    );

    const bestExtracted = pickBestObservationCandidate(extractedCandidates);
    const bestExternal = pickBestExternalCandidate(externalCandidates);
    const bestArtifact = pickBestObservationCandidate(artifactCandidates);

    if (
        bestExtracted &&
        bestExternal &&
        bestExtracted.candidate.due_at !== bestExternal.candidate.due_at &&
        confidenceRank[bestExtracted.candidate.confidence] ===
            confidenceRank[bestExternal.candidate.confidence]
    ) {
        precedence_decisions.push({
            aspect: 'due_context',
            winner_type: 'derived_value',
            rationale: 'conflicting extracted and external due facts require manual review',
        });

        return {
            hasDueContext: false,
            due_context: {
                due_at: null,
                due_basis: null,
                due_precision: null,
            },
            winning_due_observation_ids: [],
            winning_external_due_refs: [],
            supporting_due_observation_ids: [],
            supporting_external_due_refs: [bestExternal.ref_id],
            warnings,
            review_reason: 'due_context_conflict',
            blocking_reason: null,
            precedence_decisions,
        };
    }

    if (bestExtracted) {
        const supportingObservationIds = artifactCandidates.map(
            (item) => item.observation.observation_id,
        );
        const supportingExternalRefs = bestExternal ? [bestExternal.ref_id] : [];

        if (
            (bestArtifact &&
                bestArtifact.candidate.due_at !== bestExtracted.candidate.due_at) ||
            (bestExternal &&
                bestExternal.candidate.due_at !== bestExtracted.candidate.due_at)
        ) {
            warnings.push('minor_conflict_resolved_by_precedence');
        }

        if (bestExtracted.candidate.due_precision !== 'exact_day') {
            warnings.push('due_precision_reduced');
        }

        precedence_decisions.push({
            aspect: 'due_context',
            winner_type: 'observed_fact',
            rationale:
                'extracted and validated observational fact prevails over artifact presence or lower-priority due contribution',
        });

        return {
            hasDueContext: true,
            due_context: {
                due_at: bestExtracted.candidate.due_at,
                due_basis: bestExtracted.candidate.due_basis,
                due_precision: bestExtracted.candidate.due_precision,
            },
            winning_due_observation_ids: [bestExtracted.observation.observation_id],
            winning_external_due_refs: [],
            supporting_due_observation_ids: supportingObservationIds,
            supporting_external_due_refs: supportingExternalRefs,
            warnings,
            review_reason: null,
            blocking_reason: null,
            precedence_decisions,
        };
    }

    if (bestExternal) {
        if (bestExternal.candidate.due_precision !== 'exact_day') {
            warnings.push('due_precision_reduced');
        }

        precedence_decisions.push({
            aspect: 'due_context',
            winner_type: 'external_contribution',
            rationale: 'external due contribution supplies the best available due context',
        });

        return {
            hasDueContext: true,
            due_context: {
                due_at: bestExternal.candidate.due_at,
                due_basis: bestExternal.candidate.due_basis,
                due_precision: bestExternal.candidate.due_precision,
            },
            winning_due_observation_ids: [],
            winning_external_due_refs: [bestExternal.ref_id],
            supporting_due_observation_ids: [],
            supporting_external_due_refs: [],
            warnings,
            review_reason: null,
            blocking_reason: null,
            precedence_decisions,
        };
    }

    return {
        hasDueContext: false,
        due_context: {
            due_at: null,
            due_basis: null,
            due_precision: null,
        },
        winning_due_observation_ids: [],
        winning_external_due_refs: [],
        supporting_due_observation_ids: artifactCandidates.map(
            (item) => item.observation.observation_id,
        ),
        supporting_external_due_refs: [],
        warnings,
        review_reason: null,
        blocking_reason: null,
        precedence_decisions,
    };
}

function extractDueCandidate(observation: ObservationInput): DueCandidateV1 | null {
    const due_at = asString(observation.fact_payload.due_at);
    const due_basis = asDueBasis(observation.fact_payload.due_basis);
    const due_precision = asDuePrecision(observation.fact_payload.due_precision);

    if (!due_at || !due_basis || !due_precision) {
        return null;
    }

    return {
        fact_type: observation.fact_type,
        due_at,
        due_basis,
        due_precision,
        confidence: observation.confidence,
    };
}

function pickBestObservationCandidate(
    candidates: Array<{ observation: ObservationInput; candidate: DueCandidateV1 }>,
): { observation: ObservationInput; candidate: DueCandidateV1 } | null {
    return (
        candidates
            .slice()
            .sort(
                (left, right) =>
                    confidenceRank[right.candidate.confidence] -
                    confidenceRank[left.candidate.confidence],
            )[0] ?? null
    );
}

function pickBestExternalCandidate(
    candidates: Array<{ ref_id: string; candidate: DueCandidateV1 }>,
): { ref_id: string; candidate: DueCandidateV1 } | null {
    return (
        candidates
            .slice()
            .sort(
                (left, right) =>
                    confidenceRank[right.candidate.confidence] -
                    confidenceRank[left.candidate.confidence],
            )[0] ?? null
    );
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asDueBasis(
    value: unknown,
): DueCandidateV1['due_basis'] | null {
    return value === 'registry_document' ||
        value === 'extracted_fact' ||
        value === 'derived_rule'
        ? value
        : null;
}

function asDuePrecision(
    value: unknown,
): DueCandidateV1['due_precision'] | null {
    return value === 'exact_day' || value === 'month_only' || value === 'coarse'
        ? value
        : null;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
