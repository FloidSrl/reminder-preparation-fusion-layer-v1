import type { ObservationInput } from '../../domain/contracts.js';
import type {
    ExternalDueContributionV1,
    RecipientCandidateV1,
    ReminderRevisionCaseV1,
    ResolvedAddressingV1,
    ResolvedRecipientV1,
} from '../../domain/types.js';

export const REMINDER_REVISION_V1_REQUIRED_FACT_TYPES = [
    'revision_due_fact',
    'extracted_due_fact',
] as const;

export const REMINDER_REVISION_V1_CONDITIONALLY_USEFUL_FACT_TYPES = [
    'vehicle_identity_fact',
    'registered_owner_fact',
    'duplicate_relation_fact',
] as const;

export const REMINDER_REVISION_V1_WEAK_SIGNAL_ONLY_FACT_TYPES = [
    'artifact_presence_signal',
] as const;

export const REMINDER_REVISION_V1_ALLOWED_FACT_TYPES = [
    ...REMINDER_REVISION_V1_REQUIRED_FACT_TYPES,
    ...REMINDER_REVISION_V1_CONDITIONALLY_USEFUL_FACT_TYPES,
    ...REMINDER_REVISION_V1_WEAK_SIGNAL_ONLY_FACT_TYPES,
] as const;

export type EchoesReminderRevisionAllowedFactTypeV1 =
    (typeof REMINDER_REVISION_V1_ALLOWED_FACT_TYPES)[number];

export type EchoesReminderRevisionFactClassificationV1 =
    | 'required'
    | 'conditionally_useful'
    | 'weak_signal_only'
    | 'ignored';

export interface EchoesReminderRevisionExternalContributionsV1 {
    external_due_contributions?: ExternalDueContributionV1[];
    recipient_candidates?: RecipientCandidateV1[];
    resolved_recipient?: ResolvedRecipientV1 | null;
    resolved_addressing?: ResolvedAddressingV1 | null;
    final_subject?: Record<string, unknown> | null;
    policy_flags?: ReminderRevisionCaseV1['policy_flags'];
}

export interface EchoesReminderRevisionAdapterInputV1 {
    preparation_evaluation_id: string;
    prepared_record_id: string;
    source_contract_version: string;
    created_at: string;
    generated_at: string;
    observations: ObservationInput[];
    external_contributions?: EchoesReminderRevisionExternalContributionsV1;
}

export function classifyEchoesReminderRevisionFactTypeV1(
    factType: string,
): EchoesReminderRevisionFactClassificationV1 {
    if (
        REMINDER_REVISION_V1_REQUIRED_FACT_TYPES.includes(
            factType as (typeof REMINDER_REVISION_V1_REQUIRED_FACT_TYPES)[number],
        )
    ) {
        return 'required';
    }

    if (
        REMINDER_REVISION_V1_CONDITIONALLY_USEFUL_FACT_TYPES.includes(
            factType as (typeof REMINDER_REVISION_V1_CONDITIONALLY_USEFUL_FACT_TYPES)[number],
        )
    ) {
        return 'conditionally_useful';
    }

    if (
        REMINDER_REVISION_V1_WEAK_SIGNAL_ONLY_FACT_TYPES.includes(
            factType as (typeof REMINDER_REVISION_V1_WEAK_SIGNAL_ONLY_FACT_TYPES)[number],
        )
    ) {
        return 'weak_signal_only';
    }

    return 'ignored';
}

export function isEchoesReminderRevisionAllowedObservationV1(
    observation: ObservationInput,
): observation is ObservationInput & {
    fact_type: EchoesReminderRevisionAllowedFactTypeV1;
} {
    return classifyEchoesReminderRevisionFactTypeV1(observation.fact_type) !== 'ignored';
}
