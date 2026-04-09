import type {
    ContactProfile,
    IdentityKey,
    NormalizedVehicleIdentity,
    PartyIdentityV1,
    RecipientResolutionResultV1,
    PreparationReason,
    PreparedKey,
    PrecedenceRule,
    PreparationResultV1,
    PreparationStatus,
    ReminderPreparedRecordV1,
    RevisionVerification,
    SourceSystem,
    SourceTraceV1,
} from '../domain/model.js';

export interface PreparationInput {
    preparationEvaluationId: string;
    preparedRecordId?: string;
    preparedKey?: PreparedKey;
    identityKey: IdentityKey;
    vehicleIdentity: NormalizedVehicleIdentity;
    partyIdentity?: PartyIdentityV1;
    recipientResolution?: RecipientResolutionResultV1;
    contactProfile: ContactProfile;
    revisionVerification: RevisionVerification;
    internalRevisionFound: boolean;
    identityMismatchDetected: boolean;
    sourceTrace: SourceTraceV1;
    startedAt: string;
    createdAt: string;
}

export function prepareReminderRecordV1(
    input: PreparationInput,
): PreparationResultV1 {
    const preparationReasons: PreparationReason[] = [];

    const preparationStatus = determinePreparationStatus(
        input,
        preparationReasons,
    );
    appendRecipientResolutionPreparedReason(
        input.recipientResolution,
        preparationStatus,
        preparationReasons,
    );

    const sourceTrace = applyMinimumPrecedenceRules(input.sourceTrace);

    const finalSourceTrace: SourceTraceV1 = {
        ...sourceTrace,
        finalStatusReasons: [...preparationReasons],
    };

    const preparedRecord = canProducePreparedRecord(preparationStatus)
        ? buildPreparedRecord(input, preparationStatus, preparationReasons, finalSourceTrace)
        : null;

    return {
        evaluation: {
            preparationEvaluationId: input.preparationEvaluationId,
            identityKey: input.identityKey,
            preparedKey: preparedRecord?.preparedKey ?? null,
            evaluationStatus: 'completed',
            preparationStatus,
            preparationReasons,
            sourceTrace: finalSourceTrace,
            preparedRecordId: preparedRecord?.preparedRecordId ?? null,
            startedAt: input.startedAt,
            completedAt: input.createdAt,
        },
        preparedRecord,
    };
}

function determinePreparationStatus(
    input: PreparationInput,
    preparationReasons: PreparationReason[],
): PreparationStatus {
    if (input.identityMismatchDetected) {
        preparationReasons.push('identity_mismatch_detected');
        return 'identity_mismatch_review_required';
    }

    const recipientResolutionReason = getRecipientResolutionReviewReason(
        input.recipientResolution,
    );

    if (recipientResolutionReason) {
        preparationReasons.push(recipientResolutionReason);
        return 'identity_mismatch_review_required';
    }

    if (input.internalRevisionFound) {
        preparationReasons.push('internal_revision_found_in_echoes');
        return 'excluded_internal_revision_found';
    }

    if (
        input.revisionVerification.verificationStatus ===
        'already_revised_elsewhere'
    ) {
        preparationReasons.push('external_verification_reports_already_revised');
        return 'already_revised_elsewhere';
    }

    if (!hasMinimumContactData(input.contactProfile)) {
        preparationReasons.push('insufficient_contact_data');
        return 'insufficient_contact_data';
    }

    const externalVerificationReason = getExternalVerificationReason(
        input.revisionVerification,
    );

    if (externalVerificationReason) {
        preparationReasons.push(externalVerificationReason);
        return 'needs_external_verification';
    }

    if (hasContactWarning(input.contactProfile)) {
        preparationReasons.push('contact_profile_contains_warning_quality');
        return 'ready_with_contact_warning';
    }

    preparationReasons.push('record_prepared_with_deterministic_precedence');
    return 'ready';
}

function getRecipientResolutionReviewReason(
    recipientResolution?: RecipientResolutionResultV1,
): PreparationReason | null {
    if (!recipientResolution) {
        return null;
    }

    if (recipientResolution.resolutionStatus !== 'review_required') {
        return null;
    }

    if (
        recipientResolution.resolutionReason ===
        'institutional_holder_without_lessee'
    ) {
        return 'institutional_holder_without_lessee';
    }

    if (
        recipientResolution.resolutionReason ===
        'institutional_holder_match_ambiguous'
    ) {
        return 'institutional_holder_match_ambiguous';
    }

    return null;
}

function getExternalVerificationReason(
    revisionVerification: RevisionVerification,
): PreparationReason | null {
    if (revisionVerification.verificationStatus === 'not_checked') {
        return 'external_verification_missing_for_revision_state';
    }

    if (
        revisionVerification.verificationStatus === 'not_verifiable' ||
        revisionVerification.verificationStatus === 'check_failed'
    ) {
        return 'external_verification_failed_for_revision_state';
    }

    return null;
}

function hasMinimumContactData(contactProfile: ContactProfile): boolean {
    const hasPhone = Boolean(contactProfile.phone.value);
    const hasEmail = Boolean(contactProfile.email.value);
    const hasPostalAddress = Boolean(
        contactProfile.address.value &&
            contactProfile.postalCode.value &&
            contactProfile.city.value,
    );

    return hasPhone || hasEmail || hasPostalAddress;
}

function hasContactWarning(contactProfile: ContactProfile): boolean {
    return Object.values(contactProfile.fieldQuality).some(
        (quality) =>
            quality === 'stale_suspected' || quality === 'conflicting',
    );
}

function canProducePreparedRecord(preparationStatus: PreparationStatus): boolean {
    return (
        preparationStatus === 'ready' ||
        preparationStatus === 'ready_with_contact_warning'
    );
}

function appendRecipientResolutionPreparedReason(
    recipientResolution: RecipientResolutionResultV1 | undefined,
    preparationStatus: PreparationStatus,
    preparationReasons: PreparationReason[],
): void {
    if (!recipientResolution) {
        return;
    }

    if (
        recipientResolution.resolutionStatus === 'lessee_substituted' &&
        canProducePreparedRecord(preparationStatus) &&
        !preparationReasons.includes('recipient_substituted_to_lessee')
    ) {
        preparationReasons.push('recipient_substituted_to_lessee');
    }
}

function buildPreparedRecord(
    input: PreparationInput,
    preparationStatus: PreparationStatus,
    preparationReasons: PreparationReason[],
    sourceTrace: SourceTraceV1,
): ReminderPreparedRecordV1 {
    if (!input.preparedRecordId || !input.preparedKey) {
        throw new Error(
            'preparedRecordId and preparedKey are required when the evaluation produces a prepared record',
        );
    }

    return {
        preparationEvaluationId: input.preparationEvaluationId,
        preparedRecordId: input.preparedRecordId,
        identityKey: input.identityKey,
        preparedKey: input.preparedKey,
        vehicleIdentity: input.vehicleIdentity,
        ...(input.partyIdentity ? { partyIdentity: input.partyIdentity } : {}),
        contactProfile: input.contactProfile,
        revisionVerification: input.revisionVerification,
        preparationStatus,
        preparationReasons,
        sourceTrace,
        createdAt: input.createdAt,
    };
}

function applyMinimumPrecedenceRules(sourceTrace: SourceTraceV1): SourceTraceV1 {
    const appliedPrecedences = [...sourceTrace.appliedPrecedences];
    const winningFieldSources = [...sourceTrace.winningFieldSources];

    ensurePrecedence(
        appliedPrecedences,
        'candidate_due_context',
        'aci_candidate_due_context_primary',
        'aci_csv',
    );
    ensurePrecedence(
        appliedPrecedences,
        'contact_profile',
        'yap_contact_primary',
        'yap_csv',
    );
    ensurePrecedence(
        appliedPrecedences,
        'revision_verification',
        getRevisionVerificationRule(sourceTrace),
        getRevisionWinningSource(sourceTrace),
    );

    ensureWinningFieldRule(
        winningFieldSources,
        'vehicle_identity',
        'aci_candidate_due_context_primary',
        'aci_csv',
    );
    ensureWinningFieldRule(
        winningFieldSources,
        'due_context',
        'aci_candidate_due_context_primary',
        'aci_csv',
    );
    ensureContactWinningFieldRules(winningFieldSources);
    ensureRevisionWinningFieldRule(winningFieldSources, sourceTrace);

    return {
        ...sourceTrace,
        appliedPrecedences,
        winningFieldSources,
    };
}

function ensurePrecedence(
    appliedPrecedences: SourceTraceV1['appliedPrecedences'],
    scope: 'candidate_due_context' | 'contact_profile' | 'revision_verification',
    rule: PrecedenceRule,
    winningSource: SourceSystem | 'merged',
): void {
    if (appliedPrecedences.some((precedence) => precedence.scope === scope)) {
        return;
    }

    appliedPrecedences.push({
        scope,
        rule,
        winningSource,
        overriddenSources: [],
    });
}

function ensureWinningFieldRule(
    winningFieldSources: SourceTraceV1['winningFieldSources'],
    field: SourceTraceV1['winningFieldSources'][number]['field'],
    appliedRule: PrecedenceRule,
    winningSource: SourceSystem | 'merged' | 'none',
): void {
    if (winningFieldSources.some((winner) => winner.field === field)) {
        return;
    }

    winningFieldSources.push({
        field,
        winningSource,
        appliedRule,
    });
}

function ensureContactWinningFieldRules(
    winningFieldSources: SourceTraceV1['winningFieldSources'],
): void {
    for (const field of [
        'contact_name',
        'contact_address',
        'contact_email',
        'contact_phone',
    ] as const) {
        ensureWinningFieldRule(
            winningFieldSources,
            field,
            'yap_contact_primary',
            'yap_csv',
        );
    }
}

function ensureRevisionWinningFieldRule(
    winningFieldSources: SourceTraceV1['winningFieldSources'],
    sourceTrace: SourceTraceV1,
): void {
    ensureWinningFieldRule(
        winningFieldSources,
        'revision_verification',
        getRevisionVerificationRule(sourceTrace),
        getRevisionWinningSource(sourceTrace),
    );
}

function getRevisionVerificationRule(
    sourceTrace: SourceTraceV1,
): PrecedenceRule {
    return sourceTrace.externalVerification
        ? 'external_verification_adapter_revision_resolution_primary'
        : 'echoes_internal_revision_exclusion_primary';
}

function getRevisionWinningSource(
    sourceTrace: SourceTraceV1,
): SourceSystem | 'merged' {
    return sourceTrace.externalVerification
        ? 'external_verification_adapter'
        : 'echoes_read_model';
}
