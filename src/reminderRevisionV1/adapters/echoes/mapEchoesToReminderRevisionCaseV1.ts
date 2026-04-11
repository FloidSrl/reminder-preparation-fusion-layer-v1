import type { ObservationInput } from '../../domain/contracts.js';
import type {
    RecipientCandidateV1,
    ReminderRevisionCaseV1,
} from '../../domain/types.js';
import {
    isEchoesReminderRevisionAllowedObservationV1,
    type EchoesReminderRevisionAdapterInputV1,
} from './types.js';

export function mapEchoesToReminderRevisionCaseV1(
    input: EchoesReminderRevisionAdapterInputV1,
): ReminderRevisionCaseV1 {
    const allowedObservations = input.observations.filter(
        isEchoesReminderRevisionAllowedObservationV1,
    );
    const registeredOwner = resolveRegisteredOwner(allowedObservations);
    const vehicleIdentity = resolveVehicleIdentity(allowedObservations);
    const recipientCandidates = mergeRecipientCandidates(
        allowedObservations,
        input.external_contributions?.recipient_candidates ?? [],
    );

    return {
        preparation_evaluation_id: input.preparation_evaluation_id,
        prepared_record_id: input.prepared_record_id,
        source_contract_version: input.source_contract_version,
        created_at: input.created_at,
        generated_at: input.generated_at,
        observations: [...allowedObservations],
        external_due_contributions: [
            ...(input.external_contributions?.external_due_contributions ?? []),
        ],
        registered_owner: registeredOwner,
        final_subject: input.external_contributions?.final_subject ?? null,
        vehicle_identity: vehicleIdentity,
        recipient_candidates: recipientCandidates,
        resolved_recipient: input.external_contributions?.resolved_recipient ?? null,
        resolved_addressing: input.external_contributions?.resolved_addressing ?? null,
        duplicate_state: resolveDuplicateState(allowedObservations),
        ...(input.external_contributions?.policy_flags
            ? {
                  policy_flags: {
                      ...input.external_contributions.policy_flags,
                  },
              }
            : {}),
    };
}

function resolveRegisteredOwner(
    observations: ObservationInput[],
): Record<string, unknown> | null {
    const owners = observations
        .filter((observation) => observation.fact_type === 'registered_owner_fact')
        .map((observation) => ({
            subject_ref: asString(observation.fact_payload.subject_ref),
            display_name: asString(observation.fact_payload.display_name),
            observation_id: observation.observation_id,
            confidence: observation.confidence,
        }))
        .filter(
            (
                owner,
            ): owner is {
                subject_ref: string;
                display_name: string | null;
                observation_id: string;
                confidence: ObservationInput['confidence'];
            } => owner.subject_ref !== null,
        )
        .sort(compareByConfidenceThenObservation);

    if (owners.length !== 1) {
        return null;
    }

    const owner = owners[0];

    if (!owner) {
        return null;
    }

    return {
        subject_ref: owner.subject_ref,
        ...(owner.display_name ? { display_name: owner.display_name } : {}),
    };
}

function resolveVehicleIdentity(
    observations: ObservationInput[],
): ReminderRevisionCaseV1['vehicle_identity'] {
    const explicitVehicleFacts = observations
        .filter((observation) => observation.fact_type === 'vehicle_identity_fact')
        .map((observation) => ({
            plate:
                asString(observation.fact_payload.plate) ??
                asString(observation.correlation_keys.vehicle_plate),
            vehicle_type: asString(observation.fact_payload.vehicle_type),
            observation_id: observation.observation_id,
            confidence: observation.confidence,
        }))
        .filter(
            (
                candidate,
            ): candidate is {
                plate: string | null;
                vehicle_type: string | null;
                observation_id: string;
                confidence: ObservationInput['confidence'];
            } => candidate.plate !== null || candidate.vehicle_type !== null,
        )
        .sort(compareByConfidenceThenObservation);

    const bestExplicit = explicitVehicleFacts[0];

    if (bestExplicit) {
        return {
            plate: bestExplicit.plate,
            vehicle_type: bestExplicit.vehicle_type,
        };
    }

    return {
        plate: null,
        vehicle_type: null,
    };
}

function mergeRecipientCandidates(
    observations: ObservationInput[],
    externalCandidates: RecipientCandidateV1[],
): RecipientCandidateV1[] {
    const ownerCandidates: RecipientCandidateV1[] = [];

    for (const observation of observations) {
        if (observation.fact_type !== 'registered_owner_fact') {
            continue;
        }

        const candidateId = asString(observation.fact_payload.subject_ref);

        if (!candidateId) {
            continue;
        }

        ownerCandidates.push({
            candidate_id: candidateId,
            role: 'registered_owner',
            confidence: observation.confidence,
        });
    }

    const merged = [...ownerCandidates, ...externalCandidates];
    const byCandidateId = new Map<string, RecipientCandidateV1>();

    for (const candidate of merged) {
        const existing = byCandidateId.get(candidate.candidate_id);

        if (!existing || compareConfidence(candidate.confidence, existing.confidence) < 0) {
            byCandidateId.set(candidate.candidate_id, candidate);
        }
    }

    return [...byCandidateId.values()].sort((left, right) =>
        left.candidate_id.localeCompare(right.candidate_id),
    );
}

function resolveDuplicateState(
    observations: ObservationInput[],
): ReminderRevisionCaseV1['duplicate_state'] {
    const states = observations
        .filter((observation) => observation.fact_type === 'duplicate_relation_fact')
        .map((observation) => asDuplicateState(observation.fact_payload.duplicate_state))
        .filter((state): state is ReminderRevisionCaseV1['duplicate_state'] => state !== null);

    if (states.length === 0) {
        return 'unique';
    }

    if (states.includes('unresolved')) {
        return 'unresolved';
    }

    if (states.includes('duplicate')) {
        return 'duplicate';
    }

    if (states.includes('superseded')) {
        return 'superseded';
    }

    return 'unique';
}

function compareByConfidenceThenObservation(
    left: { confidence: ObservationInput['confidence']; observation_id: string },
    right: { confidence: ObservationInput['confidence']; observation_id: string },
): number {
    const confidenceOrder = compareConfidence(left.confidence, right.confidence);

    return confidenceOrder !== 0
        ? confidenceOrder
        : left.observation_id.localeCompare(right.observation_id);
}

function compareConfidence(
    left: ObservationInput['confidence'],
    right: ObservationInput['confidence'],
): number {
    return confidenceRank(right) - confidenceRank(left);
}

function confidenceRank(confidence: ObservationInput['confidence']): number {
    switch (confidence) {
        case 'high':
            return 3;
        case 'medium':
            return 2;
        case 'low':
            return 1;
    }
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asDuplicateState(
    value: unknown,
): ReminderRevisionCaseV1['duplicate_state'] | null {
    return value === 'unique' ||
        value === 'duplicate' ||
        value === 'superseded' ||
        value === 'unresolved'
        ? value
        : null;
}
