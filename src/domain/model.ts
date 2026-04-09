export type SourceSystem =
    | 'aci_csv'
    | 'yap_csv'
    | 'echoes_read_model'
    | 'external_verification_adapter';

export type IdentityKey = string;

export type PreparedKey = string;

export type PartyKind =
    | 'natural_person'
    | 'sole_proprietorship'
    | 'organization';

export type TaxIdentityStatus =
    | 'missing_tax_identity'
    | 'codice_fiscale_only'
    | 'partita_iva_only'
    | 'codice_fiscale_and_partita_iva';

export type TaxIdentityWarning =
    | 'codice_fiscale_format_warning'
    | 'partita_iva_format_warning';

export type InstitutionalHolderKind =
    | 'bank_finance'
    | 'leasing'
    | 'rental_fleet'
    | 'dealer'
    | 'other_institutional';

export type HolderClassificationStatus = 'matched' | 'not_matched' | 'ambiguous';

export type HolderMatchedBy =
    | 'partita_iva_exact'
    | 'codice_fiscale_exact'
    | 'canonical_name_exact'
    | 'alias_exact';

export type RecipientResolutionStatus =
    | 'owner_retained'
    | 'lessee_substituted'
    | 'review_required';

export type RecipientResolutionReason =
    | 'non_institutional_owner'
    | 'institutional_holder_with_lessee'
    | 'institutional_holder_without_lessee'
    | 'institutional_holder_match_ambiguous';

export type FieldQuality =
    | 'as_provided'
    | 'normalized'
    | 'enriched'
    | 'stale_suspected'
    | 'verified_external'
    | 'conflicting'
    | 'missing';

export type VerificationStatus =
    | 'not_checked'
    | 'verified_current'
    | 'already_revised_elsewhere'
    | 'not_verifiable'
    | 'check_failed';

export type VerificationChannel =
    | 'manual_portale'
    | 'assisted_portale'
    | 'mit_webservice'
    | 'ministerial_adapter_other';

export type PreparationStatus =
    | 'ready'
    | 'ready_with_contact_warning'
    | 'needs_external_verification'
    | 'already_revised_elsewhere'
    | 'excluded_internal_revision_found'
    | 'insufficient_contact_data'
    | 'identity_mismatch_review_required';

export type PreparationReason =
    | 'identity_mismatch_detected'
    | 'internal_revision_found_in_echoes'
    | 'external_verification_reports_already_revised'
    | 'external_verification_missing_for_revision_state'
    | 'external_verification_failed_for_revision_state'
    | 'insufficient_contact_data'
    | 'contact_profile_contains_warning_quality'
    | 'recipient_substituted_to_lessee'
    | 'institutional_holder_without_lessee'
    | 'institutional_holder_match_ambiguous'
    | 'record_prepared_with_deterministic_precedence';

export type EvaluationStatus = 'started' | 'completed' | 'failed';

export type PrecedenceRule =
    | 'aci_candidate_due_context_primary'
    | 'yap_contact_primary'
    | 'echoes_internal_revision_exclusion_primary'
    | 'external_verification_adapter_revision_resolution_primary';

export type LinkageStatus = 'linked' | 'not_linked' | 'ambiguous' | 'rejected';

export type LinkageReason =
    | 'exact_plate_match'
    | 'exact_plate_and_vehicle_type_match'
    | 'exact_plate_with_due_context_support'
    | 'missing_plate_on_yap'
    | 'no_plate_match'
    | 'multiple_yap_rows_same_plate'
    | 'vehicle_type_conflict'
    | 'due_context_conflict'
    | 'insufficient_linkage_evidence';

export type LinkageCriterion =
    | 'plate_exact'
    | 'vehicle_type_match'
    | 'vehicle_type_conflict'
    | 'due_month_match'
    | 'due_year_match'
    | 'due_context_conflict'
    | 'name_support_present'
    | 'email_support_present'
    | 'phone_support_present'
    | 'missing_plate'
    | 'multiple_candidates';

export interface LinkageResultV1<TCandidate = unknown> {
    linkageStatus: LinkageStatus;
    linkageReason: LinkageReason;
    matchedCandidate: TCandidate | null;
    criteriaUsed: LinkageCriterion[];
    matchedCandidatesCount: number;
    supportFieldsUsed: Array<'vehicle_type' | 'due_context' | 'name' | 'email' | 'phone'>;
    note: string;
}

export interface TraceRef {
    sourceSystem: SourceSystem;
    sourceBatchId?: string;
    sourceRowKey?: string;
    note: string;
}

export interface RawSourceRecord {
    sourceSystem: SourceSystem;
    sourceFileId?: string;
    sourceBatchId?: string;
    sourceRowKey: string;
    rawPayload: Record<string, unknown>;
    ingestedAt: string;
}

export interface NormalizedVehicleIdentity {
    identityKey: IdentityKey;
    plate: string;
    vehicleType?: string;
    dueMonth?: number;
    dueYear?: number;
    normalizationTrace: TraceRef[];
}

export interface ProvenancedField<T> {
    value: T | null;
    source: SourceSystem | 'merged' | 'none';
    quality: FieldQuality;
}

export interface PartyIdentityV1 {
    partyKind: PartyKind;
    displayName: string;
    givenName?: string;
    familyName?: string;
    businessName?: string;
    codiceFiscale?: string;
    partitaIva?: string;
    taxIdentityStatus: TaxIdentityStatus;
    taxIdentityWarnings: TaxIdentityWarning[];
    sourceTrace: TraceRef[];
}

export interface InstitutionalHolderRegistryEntryV1 {
    entryId: string;
    kind: InstitutionalHolderKind;
    canonicalName: string;
    aliases: string[];
    partitaIva?: string;
    codiceFiscale?: string;
    isActive: boolean;
    notes?: string;
}

export interface HolderClassificationResultV1 {
    classificationStatus: HolderClassificationStatus;
    matchedBy?: HolderMatchedBy;
    matchedEntry?: InstitutionalHolderRegistryEntryV1;
    ambiguousEntries?: InstitutionalHolderRegistryEntryV1[];
    normalizedHolderName: string;
    note: string;
}

export interface RecipientResolutionResultV1 {
    resolutionStatus: RecipientResolutionStatus;
    resolutionReason: RecipientResolutionReason;
    registeredOwner: PartyIdentityV1;
    resolvedRecipient: PartyIdentityV1 | null;
    lesseeOrUser?: PartyIdentityV1;
    holderClassification: HolderClassificationResultV1;
    note: string;
}

export interface ContactProfile {
    name: ProvenancedField<string>;
    address: ProvenancedField<string>;
    postalCode: ProvenancedField<string>;
    city: ProvenancedField<string>;
    province: ProvenancedField<string>;
    email: ProvenancedField<string>;
    phone: ProvenancedField<string>;
    fieldSources: Record<string, SourceSystem | 'merged' | 'none'>;
    fieldQuality: Record<string, FieldQuality>;
    matchConfidence: 'strong' | 'supported' | 'weak';
}

export interface RevisionVerification {
    verificationStatus: VerificationStatus;
    lastRevisionDate?: string;
    verifiedAt?: string;
    verificationSource?: SourceSystem;
    verificationChannel?: VerificationChannel;
    verificationTrace: TraceRef[];
}

export interface SourceTraceRawRecord {
    sourceSystem: SourceSystem;
    rawRecordId?: string;
    sourceBatchId?: string;
    sourceRowKey: string;
    role:
        | 'candidate'
        | 'contact_enrichment'
        | 'internal_revision_history'
        | 'external_verification_result';
}

export interface SourceTraceFieldWinner {
    field:
        | 'vehicle_identity'
        | 'contact_name'
        | 'contact_address'
        | 'contact_email'
        | 'contact_phone'
        | 'revision_verification'
        | 'due_context';
    winningSource: SourceSystem | 'merged' | 'none';
    appliedRule: PrecedenceRule;
}

export interface SourceTraceExternalVerification {
    sourceSystem: 'external_verification_adapter';
    verificationResultId?: string;
    verificationStatus: VerificationStatus;
    verificationChannel?: VerificationChannel;
}

export interface SourceTracePrecedence {
    scope: 'candidate_due_context' | 'contact_profile' | 'revision_verification';
    rule: PrecedenceRule;
    winningSource: SourceSystem | 'merged';
    overriddenSources: SourceSystem[];
}

export interface SourceTraceV1 {
    contributingRawRecords: SourceTraceRawRecord[];
    winningFieldSources: SourceTraceFieldWinner[];
    externalVerification?: SourceTraceExternalVerification;
    appliedPrecedences: SourceTracePrecedence[];
    finalStatusReasons: PreparationReason[];
}

export interface PreparationEvaluationV1 {
    preparationEvaluationId: string;
    identityKey: IdentityKey;
    preparedKey: PreparedKey | null;
    evaluationStatus: EvaluationStatus;
    preparationStatus: PreparationStatus;
    preparationReasons: PreparationReason[];
    sourceTrace: SourceTraceV1;
    preparedRecordId: string | null;
    startedAt: string;
    completedAt?: string;
}

export interface ReminderPreparedRecordV1 {
    preparationEvaluationId: string;
    preparedRecordId: string;
    identityKey: IdentityKey;
    preparedKey: PreparedKey;
    vehicleIdentity: NormalizedVehicleIdentity;
    partyIdentity?: PartyIdentityV1;
    contactProfile: ContactProfile;
    revisionVerification: RevisionVerification;
    preparationStatus: PreparationStatus;
    preparationReasons: PreparationReason[];
    sourceTrace: SourceTraceV1;
    createdAt: string;
}

export interface PreparationResultV1 {
    evaluation: PreparationEvaluationV1;
    preparedRecord: ReminderPreparedRecordV1 | null;
}
