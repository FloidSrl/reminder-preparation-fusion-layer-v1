import type {
    ContactProfile,
    LinkageResultV1,
    PartyIdentityV1,
    RecipientResolutionResultV1,
    PreparationReason,
    PreparedKey,
    ProvenancedField,
    RevisionVerification,
    SourceTraceExternalVerification,
    SourceTraceFieldWinner,
    SourceTracePrecedence,
    SourceTraceRawRecord,
    SourceTraceV1,
} from '../domain/model.js';
import type {
    NormalizedAciContributionV1,
    NormalizedYapContributionV1,
} from '../input/intakeV1.js';
import type { PreparationInput } from './prepareReminderRecord.js';

export interface EchoesRevisionStateInputV1 {
    internalRevisionFound: boolean;
    sourceBatchId?: string;
    sourceRowKey?: string;
    note?: string;
}

export interface ComposePreparationInputV1 {
    preparationEvaluationId: string;
    preparedRecordId?: string;
    preparedKey?: PreparedKey;
    startedAt: string;
    createdAt: string;
    aciContribution: NormalizedAciContributionV1;
    partyIdentity?: PartyIdentityV1;
    recipientResolution?: RecipientResolutionResultV1;
    yapLinkageResult?: LinkageResultV1<unknown>;
    linkedYapContribution?: NormalizedYapContributionV1;
    echoesState?: EchoesRevisionStateInputV1;
    externalVerification?: RevisionVerification;
    identityMismatchDetected?: boolean;
}

export interface ComposePreparationResultV1 {
    preparationInput: PreparationInput;
    usedContributions: string[];
    ignoredContributions: string[];
}

export function composePreparationInputV1(
    input: ComposePreparationInputV1,
): ComposePreparationResultV1 {
    const usedContributions = ['aci_candidate_due_context'];
    const ignoredContributions: string[] = [];

    const linkedYapContribution = resolveLinkedYapContribution(
        input,
        usedContributions,
        ignoredContributions,
    );
    const partyIdentity = resolvePartyIdentity(input, usedContributions);

    const contactProfile = linkedYapContribution
        ? linkedYapContribution.contactProfile
        : buildAciFallbackContactProfile(input.aciContribution);

    if (!linkedYapContribution) {
        usedContributions.push('aci_contact_hint_fallback');
    }

    if (input.echoesState?.internalRevisionFound) {
        usedContributions.push('echoes_internal_revision_state');
    }

    const revisionVerification = input.externalVerification
        ? cloneRevisionVerification(input.externalVerification)
        : buildDefaultRevisionVerification();

    if (input.externalVerification) {
        usedContributions.push('external_verification_result');
    }

    const sourceTrace = buildSourceTrace(
        input,
        contactProfile,
        linkedYapContribution,
        revisionVerification,
    );

    const preparationInput: PreparationInput = {
        preparationEvaluationId: input.preparationEvaluationId,
        identityKey: input.aciContribution.vehicleIdentity.identityKey,
        vehicleIdentity: input.aciContribution.vehicleIdentity,
        ...(partyIdentity ? { partyIdentity } : {}),
        ...(input.recipientResolution
            ? { recipientResolution: input.recipientResolution }
            : {}),
        contactProfile,
        revisionVerification,
        internalRevisionFound: input.echoesState?.internalRevisionFound ?? false,
        identityMismatchDetected: input.identityMismatchDetected ?? false,
        sourceTrace,
        startedAt: input.startedAt,
        createdAt: input.createdAt,
        ...(input.preparedRecordId
            ? { preparedRecordId: input.preparedRecordId }
            : {}),
        ...(input.preparedKey ? { preparedKey: input.preparedKey } : {}),
    };

    return {
        preparationInput,
        usedContributions,
        ignoredContributions,
    };
}

function resolvePartyIdentity(
    input: ComposePreparationInputV1,
    usedContributions: string[],
): PartyIdentityV1 | undefined {
    if (!input.recipientResolution) {
        return input.partyIdentity;
    }

    if (input.recipientResolution.resolutionStatus === 'lessee_substituted') {
        usedContributions.push('recipient_substituted_to_lessee');
        return input.recipientResolution.resolvedRecipient ?? input.partyIdentity;
    }

    if (input.recipientResolution.resolutionStatus === 'review_required') {
        usedContributions.push('institutional_holder_resolution_review');
        return input.recipientResolution.registeredOwner;
    }

    usedContributions.push('registered_owner_retained');
    return input.recipientResolution.registeredOwner;
}

function resolveLinkedYapContribution(
    input: ComposePreparationInputV1,
    usedContributions: string[],
    ignoredContributions: string[],
): NormalizedYapContributionV1 | null {
    if (!input.yapLinkageResult) {
        return null;
    }

    if (input.yapLinkageResult.linkageStatus === 'linked') {
        if (!input.linkedYapContribution) {
            throw new Error(
                'linkedYapContribution is required when yapLinkageResult is linked',
            );
        }

        usedContributions.push('yap_contact_enrichment');
        return input.linkedYapContribution;
    }

    ignoredContributions.push(
        `yap_contact_enrichment_ignored_${input.yapLinkageResult.linkageStatus}_${input.yapLinkageResult.linkageReason}`,
    );
    return null;
}

function buildAciFallbackContactProfile(
    aciContribution: NormalizedAciContributionV1,
): ContactProfile {
    return {
        name: cloneField(aciContribution.candidateContactHint.name),
        address: cloneField(aciContribution.candidateContactHint.address),
        postalCode: cloneField(aciContribution.candidateContactHint.postalCode),
        city: cloneField(aciContribution.candidateContactHint.city),
        province: cloneField(aciContribution.candidateContactHint.province),
        email: {
            value: null,
            source: 'none',
            quality: 'missing',
        },
        phone: {
            value: null,
            source: 'none',
            quality: 'missing',
        },
        fieldSources: {
            name: aciContribution.candidateContactHint.name.source,
            address: aciContribution.candidateContactHint.address.source,
            postalCode: aciContribution.candidateContactHint.postalCode.source,
            city: aciContribution.candidateContactHint.city.source,
            province: aciContribution.candidateContactHint.province.source,
            email: 'none',
            phone: 'none',
        },
        fieldQuality: {
            name: aciContribution.candidateContactHint.name.quality,
            address: aciContribution.candidateContactHint.address.quality,
            postalCode: aciContribution.candidateContactHint.postalCode.quality,
            city: aciContribution.candidateContactHint.city.quality,
            province: aciContribution.candidateContactHint.province.quality,
            email: 'missing',
            phone: 'missing',
        },
        matchConfidence: 'supported',
    };
}

function buildDefaultRevisionVerification(): RevisionVerification {
    return {
        verificationStatus: 'not_checked',
        verificationTrace: [],
    };
}

function cloneRevisionVerification(
    revisionVerification: RevisionVerification,
): RevisionVerification {
    return {
        ...revisionVerification,
        verificationTrace: [...revisionVerification.verificationTrace],
    };
}

function cloneField(field: ProvenancedField<string>): ProvenancedField<string> {
    return { ...field };
}

function buildSourceTrace(
    input: ComposePreparationInputV1,
    contactProfile: ContactProfile,
    linkedYapContribution: NormalizedYapContributionV1 | null,
    revisionVerification: RevisionVerification,
): SourceTraceV1 {
    const contributingRawRecords: SourceTraceRawRecord[] = [
        input.aciContribution.sourceTrace.contributingRawRecord,
    ];

    const appliedPrecedences: SourceTracePrecedence[] = [
        input.aciContribution.sourceTrace.appliedPrecedence,
        buildContactPrecedence(linkedYapContribution),
        buildRevisionPrecedence(revisionVerification),
    ];

    const winningFieldSources: SourceTraceFieldWinner[] = [
        {
            field: 'vehicle_identity',
            winningSource: 'aci_csv',
            appliedRule: 'aci_candidate_due_context_primary',
        },
        {
            field: 'due_context',
            winningSource: 'aci_csv',
            appliedRule: 'aci_candidate_due_context_primary',
        },
        ...buildContactFieldWinners(contactProfile, linkedYapContribution),
        {
            field: 'revision_verification',
            winningSource: revisionVerification.verificationSource ===
                'external_verification_adapter'
                ? 'external_verification_adapter'
                : 'echoes_read_model',
            appliedRule: revisionVerification.verificationSource ===
                'external_verification_adapter'
                ? 'external_verification_adapter_revision_resolution_primary'
                : 'echoes_internal_revision_exclusion_primary',
        },
    ];

    if (linkedYapContribution) {
        contributingRawRecords.push(
            linkedYapContribution.sourceTrace.contributingRawRecord,
        );
    }

    if (input.echoesState) {
        contributingRawRecords.push({
            sourceSystem: 'echoes_read_model',
            ...withOptionalSourceBatchId(input.echoesState.sourceBatchId),
            sourceRowKey: input.echoesState.sourceRowKey ?? 'echoes-revision-state',
            role: 'internal_revision_history',
        });
    }

    const externalVerification = buildExternalVerificationSummary(
        revisionVerification,
    );

    if (externalVerification) {
        const traceRef = revisionVerification.verificationTrace[0];
        contributingRawRecords.push({
            sourceSystem: 'external_verification_adapter',
            ...withOptionalSourceBatchId(traceRef?.sourceBatchId),
            sourceRowKey:
                traceRef?.sourceRowKey ?? 'external-verification-result',
            role: 'external_verification_result',
        });
    }

    const sourceTrace: SourceTraceV1 = {
        contributingRawRecords,
        winningFieldSources,
        appliedPrecedences,
        finalStatusReasons: [] satisfies PreparationReason[],
        ...(externalVerification ? { externalVerification } : {}),
    };

    return sourceTrace;
}

function buildContactPrecedence(
    linkedYapContribution: NormalizedYapContributionV1 | null,
): SourceTracePrecedence {
    if (linkedYapContribution) {
        return linkedYapContribution.sourceTrace.appliedPrecedence;
    }

    return {
        scope: 'contact_profile',
        rule: 'yap_contact_primary',
        winningSource: 'aci_csv',
        overriddenSources: [],
    };
}

function buildRevisionPrecedence(
    revisionVerification: RevisionVerification,
): SourceTracePrecedence {
    if (
        revisionVerification.verificationSource === 'external_verification_adapter'
    ) {
        return {
            scope: 'revision_verification',
            rule: 'external_verification_adapter_revision_resolution_primary',
            winningSource: 'external_verification_adapter',
            overriddenSources: ['echoes_read_model'],
        };
    }

    return {
        scope: 'revision_verification',
        rule: 'echoes_internal_revision_exclusion_primary',
        winningSource: 'echoes_read_model',
        overriddenSources: [],
    };
}

function buildContactFieldWinners(
    contactProfile: ContactProfile,
    linkedYapContribution: NormalizedYapContributionV1 | null,
): SourceTraceFieldWinner[] {
    const appliedRule = 'yap_contact_primary';
    const winners: SourceTraceFieldWinner[] = [
        {
            field: 'contact_name',
            winningSource: contactProfile.name.source,
            appliedRule,
        },
        {
            field: 'contact_address',
            winningSource: contactProfile.address.source,
            appliedRule,
        },
        {
            field: 'contact_email',
            winningSource: contactProfile.email.source,
            appliedRule,
        },
        {
            field: 'contact_phone',
            winningSource: contactProfile.phone.source,
            appliedRule,
        },
    ];

    return winners.map((winner) => ({
        ...winner,
        winningSource:
            linkedYapContribution === null && winner.winningSource === 'none'
                ? 'none'
                : winner.winningSource,
    }));
}

function buildExternalVerificationSummary(
    revisionVerification: RevisionVerification,
): SourceTraceExternalVerification | undefined {
    if (
        revisionVerification.verificationSource !== 'external_verification_adapter'
    ) {
        return undefined;
    }

    return {
        sourceSystem: 'external_verification_adapter',
        verificationStatus: revisionVerification.verificationStatus,
        ...(revisionVerification.verificationChannel
            ? { verificationChannel: revisionVerification.verificationChannel }
            : {}),
    };
}

function withOptionalSourceBatchId(sourceBatchId?: string): {
    sourceBatchId?: string;
} {
    return sourceBatchId ? { sourceBatchId } : {};
}
