import type {
    ContactProfile,
    NormalizedVehicleIdentity,
    PrecedenceRule,
    ProvenancedField,
    RawSourceRecord,
    RevisionVerification,
    SourceSystem,
    SourceTracePrecedence,
    SourceTraceRawRecord,
    VerificationChannel,
    VerificationStatus,
} from '../domain/model.js';

export interface AciCsvRowV1 {
    sourceBatchId?: string;
    sourceRowKey: string;
    plate: string;
    vehicleType?: string;
    dueMonth: string | number;
    dueYear: string | number;
    ownerName?: string;
    addressLine?: string;
    postalCode?: string;
    city?: string;
    province?: string;
}

export interface YapCsvRowV1 {
    sourceBatchId?: string;
    sourceRowKey: string;
    plate?: string;
    vehicleType?: string;
    dueMonth?: string | number;
    dueYear?: string | number;
    contactName?: string;
    addressLine?: string;
    postalCode?: string;
    city?: string;
    province?: string;
    email?: string;
    phone?: string;
}

export interface ExternalVerificationInputV1 {
    sourceBatchId?: string;
    sourceRowKey: string;
    verificationResultId?: string;
    plate: string;
    vehicleType?: string;
    verificationStatus: VerificationStatus;
    verificationChannel: VerificationChannel;
    verifiedAt?: string;
    lastRevisionDate?: string;
    note?: string;
}

export interface IntakeFieldMappingV1 {
    sourceField: string;
    operationalMeaning: string;
    targetField: string;
    required: boolean;
    normalizationNotes: string;
    provenance: string;
}

export interface NormalizedAciContributionV1 {
    rawSourceRecord: RawSourceRecord;
    vehicleIdentity: NormalizedVehicleIdentity;
    candidateContactHint: Pick<
        ContactProfile,
        'name' | 'address' | 'postalCode' | 'city' | 'province'
    >;
    sourceTrace: {
        contributingRawRecord: SourceTraceRawRecord;
        appliedPrecedence: SourceTracePrecedence;
    };
}

export interface NormalizedYapContributionV1 {
    rawSourceRecord: RawSourceRecord;
    contactProfile: ContactProfile;
    sourceTrace: {
        contributingRawRecord: SourceTraceRawRecord;
        appliedPrecedence: SourceTracePrecedence;
    };
}

export const ACI_CSV_MAPPING_V1: IntakeFieldMappingV1[] = [
    {
        sourceField: 'plate',
        operationalMeaning: 'primary operational vehicle identifier',
        targetField: 'NormalizedVehicleIdentity.plate',
        required: true,
        normalizationNotes: 'trim, uppercase, remove internal spaces',
        provenance: 'vehicle identity and due context come from aci_csv',
    },
    {
        sourceField: 'vehicleType',
        operationalMeaning: 'vehicle class supporting operational identity',
        targetField: 'NormalizedVehicleIdentity.vehicleType',
        required: false,
        normalizationNotes: 'trim and lowercase canonical short label',
        provenance: 'vehicle identity contribution from aci_csv',
    },
    {
        sourceField: 'dueMonth',
        operationalMeaning: 'external due month used by the candidate case',
        targetField: 'NormalizedVehicleIdentity.dueMonth',
        required: true,
        normalizationNotes: 'parse integer 1..12',
        provenance: 'due context winner is aci_csv',
    },
    {
        sourceField: 'dueYear',
        operationalMeaning: 'external due year used by the candidate case',
        targetField: 'NormalizedVehicleIdentity.dueYear',
        required: true,
        normalizationNotes: 'parse four-digit integer',
        provenance: 'due context winner is aci_csv',
    },
    {
        sourceField: 'ownerName',
        operationalMeaning: 'candidate contact hint only, not primary contact source',
        targetField: 'candidateContactHint.name',
        required: false,
        normalizationNotes: 'trim repeated spaces',
        provenance: 'kept as aci_csv hint, not primary precedence winner when YAP is available',
    },
    {
        sourceField: 'addressLine',
        operationalMeaning: 'candidate address hint only',
        targetField: 'candidateContactHint.address',
        required: false,
        normalizationNotes: 'trim repeated spaces',
        provenance: 'kept as aci_csv hint, superseded by YAP when YAP exists',
    },
];

export const YAP_CSV_MAPPING_V1: IntakeFieldMappingV1[] = [
    {
        sourceField: 'plate',
        operationalMeaning: 'linking hint to the operational vehicle case',
        targetField: 'ContactProfile.matchConfidence support only',
        required: false,
        normalizationNotes: 'trim, uppercase, remove internal spaces',
        provenance: 'supports deterministic linkage explanation, does not override ACI candidate identity',
    },
    {
        sourceField: 'vehicleType',
        operationalMeaning: 'supporting linkage discriminator',
        targetField: 'linkage support only',
        required: false,
        normalizationNotes: 'trim and lowercase canonical short label',
        provenance: 'supports deterministic linkage explanation, does not override ACI candidate identity',
    },
    {
        sourceField: 'dueMonth',
        operationalMeaning: 'supporting linkage month discriminator when available',
        targetField: 'linkage support only',
        required: false,
        normalizationNotes: 'parse integer 1..12 if used by linkage',
        provenance: 'support-only field for disambiguation, not candidate precedence',
    },
    {
        sourceField: 'dueYear',
        operationalMeaning: 'supporting linkage year discriminator when available',
        targetField: 'linkage support only',
        required: false,
        normalizationNotes: 'parse integer if used by linkage',
        provenance: 'support-only field for disambiguation, not candidate precedence',
    },
    {
        sourceField: 'contactName',
        operationalMeaning: 'primary contact name enrichment',
        targetField: 'ContactProfile.name',
        required: false,
        normalizationNotes: 'trim repeated spaces',
        provenance: 'winning contact source is yap_csv',
    },
    {
        sourceField: 'addressLine',
        operationalMeaning: 'primary postal address enrichment',
        targetField: 'ContactProfile.address',
        required: false,
        normalizationNotes: 'trim repeated spaces',
        provenance: 'winning contact source is yap_csv',
    },
    {
        sourceField: 'postalCode',
        operationalMeaning: 'postal routing for minimum contact completeness',
        targetField: 'ContactProfile.postalCode',
        required: false,
        normalizationNotes: 'keep digits only when possible',
        provenance: 'winning contact source is yap_csv',
    },
    {
        sourceField: 'city',
        operationalMeaning: 'locality for postal completeness',
        targetField: 'ContactProfile.city',
        required: false,
        normalizationNotes: 'trim repeated spaces',
        provenance: 'winning contact source is yap_csv',
    },
    {
        sourceField: 'email',
        operationalMeaning: 'direct digital contact',
        targetField: 'ContactProfile.email',
        required: false,
        normalizationNotes: 'trim and lowercase',
        provenance: 'winning contact source is yap_csv',
    },
    {
        sourceField: 'phone',
        operationalMeaning: 'direct phone contact',
        targetField: 'ContactProfile.phone',
        required: false,
        normalizationNotes: 'strip spaces and preserve leading plus',
        provenance: 'winning contact source is yap_csv',
    },
];

export const EXTERNAL_VERIFICATION_MAPPING_V1: IntakeFieldMappingV1[] = [
    {
        sourceField: 'verificationStatus',
        operationalMeaning: 'normalized external revision outcome',
        targetField: 'RevisionVerification.verificationStatus',
        required: true,
        normalizationNotes: 'must already be one of the closed v1 verification statuses',
        provenance: 'external verification outcome remains attributed to external_verification_adapter',
    },
    {
        sourceField: 'verifiedAt',
        operationalMeaning: 'timestamp of the external verification check',
        targetField: 'RevisionVerification.verifiedAt',
        required: false,
        normalizationNotes: 'ISO-8601 timestamp if present',
        provenance: 'trace keeps the concrete verification consultation moment',
    },
    {
        sourceField: 'lastRevisionDate',
        operationalMeaning: 'most recent externally confirmed revision date',
        targetField: 'RevisionVerification.lastRevisionDate',
        required: false,
        normalizationNotes: 'ISO date if present',
        provenance: 'revision evidence remains external_verification_adapter sourced',
    },
];

export function toNormalizedAciContributionV1(
    row: AciCsvRowV1,
): NormalizedAciContributionV1 {
    const normalizedPlate = normalizePlate(row.plate);
    const normalizedVehicleType = normalizeVehicleType(row.vehicleType);
    const normalizedDueMonth = parseMonth(row.dueMonth);
    const normalizedDueYear = parseYear(row.dueYear);

    return {
        rawSourceRecord: {
            sourceSystem: 'aci_csv',
            ...withOptionalSourceBatchId(row.sourceBatchId),
            sourceRowKey: row.sourceRowKey,
            rawPayload: { ...row },
            ingestedAt: new Date().toISOString(),
        },
        vehicleIdentity: {
            identityKey: buildIdentityKeyV1(
                normalizedPlate,
                normalizedVehicleType,
                normalizedDueMonth,
                normalizedDueYear,
            ),
            plate: normalizedPlate,
            ...withOptionalVehicleType(normalizedVehicleType),
            dueMonth: normalizedDueMonth,
            dueYear: normalizedDueYear,
            normalizationTrace: [
                {
                    sourceSystem: 'aci_csv',
                    ...withOptionalSourceBatchId(row.sourceBatchId),
                    sourceRowKey: row.sourceRowKey,
                    note: 'vehicle identity and due context normalized from ACI row',
                },
            ],
        },
        candidateContactHint: {
            name: buildProvenancedField(row.ownerName, 'aci_csv', 'normalized'),
            address: buildProvenancedField(
                row.addressLine,
                'aci_csv',
                'normalized',
            ),
            postalCode: buildProvenancedField(
                normalizePostalCode(row.postalCode),
                'aci_csv',
                'normalized',
            ),
            city: buildProvenancedField(row.city, 'aci_csv', 'normalized'),
            province: buildProvenancedField(row.province, 'aci_csv', 'normalized'),
        },
        sourceTrace: {
            contributingRawRecord: {
                sourceSystem: 'aci_csv',
                ...withOptionalSourceBatchId(row.sourceBatchId),
                sourceRowKey: row.sourceRowKey,
                role: 'candidate',
            },
            appliedPrecedence: {
                scope: 'candidate_due_context',
                rule: 'aci_candidate_due_context_primary',
                winningSource: 'aci_csv',
                overriddenSources: [],
            },
        },
    };
}

export function toNormalizedYapContributionV1(
    row: YapCsvRowV1,
): NormalizedYapContributionV1 {
    const normalizedPlate = row.plate ? normalizePlate(row.plate) : null;
    const normalizedVehicleType = normalizeVehicleType(row.vehicleType);

    return {
        rawSourceRecord: {
            sourceSystem: 'yap_csv',
            ...withOptionalSourceBatchId(row.sourceBatchId),
            sourceRowKey: row.sourceRowKey,
            rawPayload: { ...row },
            ingestedAt: new Date().toISOString(),
        },
        contactProfile: {
            name: buildProvenancedField(row.contactName, 'yap_csv', 'enriched'),
            address: buildProvenancedField(
                row.addressLine,
                'yap_csv',
                'enriched',
            ),
            postalCode: buildProvenancedField(
                normalizePostalCode(row.postalCode),
                'yap_csv',
                'enriched',
            ),
            city: buildProvenancedField(row.city, 'yap_csv', 'enriched'),
            province: buildProvenancedField(row.province, 'yap_csv', 'enriched'),
            email: buildProvenancedField(
                normalizeEmail(row.email),
                'yap_csv',
                'enriched',
            ),
            phone: buildProvenancedField(
                normalizePhone(row.phone),
                'yap_csv',
                'enriched',
            ),
            fieldSources: {
                name: 'yap_csv',
                address: 'yap_csv',
                postalCode: 'yap_csv',
                city: 'yap_csv',
                province: 'yap_csv',
                email: 'yap_csv',
                phone: 'yap_csv',
            },
            fieldQuality: {
                name: row.contactName ? 'enriched' : 'missing',
                address: row.addressLine ? 'enriched' : 'missing',
                postalCode: row.postalCode ? 'enriched' : 'missing',
                city: row.city ? 'enriched' : 'missing',
                province: row.province ? 'enriched' : 'missing',
                email: row.email ? 'enriched' : 'missing',
                phone: row.phone ? 'enriched' : 'missing',
            },
            matchConfidence:
                normalizedPlate && normalizedVehicleType
                    ? 'strong'
                    : normalizedPlate
                      ? 'supported'
                      : 'weak',
        },
        sourceTrace: {
            contributingRawRecord: {
                sourceSystem: 'yap_csv',
                ...withOptionalSourceBatchId(row.sourceBatchId),
                sourceRowKey: row.sourceRowKey,
                role: 'contact_enrichment',
            },
            appliedPrecedence: {
                scope: 'contact_profile',
                rule: 'yap_contact_primary',
                winningSource: 'yap_csv',
                overriddenSources: [],
            },
        },
    };
}

export function toRevisionVerificationFromExternalInputV1(
    input: ExternalVerificationInputV1,
): RevisionVerification {
    const revisionVerification: RevisionVerification = {
        verificationStatus: input.verificationStatus,
        verificationTrace: [
            {
                sourceSystem: 'external_verification_adapter',
                ...withOptionalSourceBatchId(input.sourceBatchId),
                sourceRowKey: input.sourceRowKey,
                note:
                    input.note ??
                    'external verification input normalized into revision verification',
            },
        ],
    };

    if (input.lastRevisionDate) {
        revisionVerification.lastRevisionDate = input.lastRevisionDate.trim();
    }

    if (input.verifiedAt) {
        revisionVerification.verifiedAt = input.verifiedAt.trim();
    }

    revisionVerification.verificationSource = 'external_verification_adapter';
    revisionVerification.verificationChannel = input.verificationChannel;

    return revisionVerification;
}

function buildIdentityKeyV1(
    plate: string,
    vehicleType: string | undefined,
    dueMonth: number,
    dueYear: number,
): string {
    const identityParts = [
        plate,
        vehicleType ?? 'unknown_vehicle_type',
        `${dueYear}-${String(dueMonth).padStart(2, '0')}`,
    ];

    return identityParts.join('|');
}

function buildProvenancedField(
    value: string | null | undefined,
    sourceSystem: SourceSystem,
    qualityWhenPresent: 'normalized' | 'enriched',
): ProvenancedField<string> {
    const normalizedValue = normalizeText(value);

    return {
        value: normalizedValue,
        source: normalizedValue === null ? 'none' : sourceSystem,
        quality: normalizedValue === null ? 'missing' : qualityWhenPresent,
    };
}

function normalizePlate(value: string): string {
    const normalizedValue = value.trim().toUpperCase().replace(/\s+/g, '');

    if (!normalizedValue) {
        throw new Error('ACI/YAP intake requires a non-empty plate when plate is provided');
    }

    return normalizedValue;
}

function normalizeVehicleType(value?: string): string | undefined {
    const normalizedValue = normalizeText(value);

    return normalizedValue?.toLowerCase();
}

function normalizePostalCode(value?: string): string | null {
    const normalizedValue = normalizeText(value);

    return normalizedValue?.replace(/\D+/g, '') ?? null;
}

function normalizeEmail(value?: string): string | null {
    const normalizedValue = normalizeText(value);

    return normalizedValue?.toLowerCase() ?? null;
}

function normalizePhone(value?: string): string | null {
    const normalizedValue = normalizeText(value);

    return normalizedValue?.replace(/(?!^\+)\D+/g, '') ?? null;
}

function normalizeText(value?: string | null): string | null {
    if (value === undefined || value === null) {
        return null;
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');

    return normalizedValue.length > 0 ? normalizedValue : null;
}

function parseMonth(value: string | number): number {
    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 12) {
        throw new Error(`ACI intake dueMonth must be an integer between 1 and 12: ${value}`);
    }

    return parsedValue;
}

function parseYear(value: string | number): number {
    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 2000 || parsedValue > 2100) {
        throw new Error(`ACI intake dueYear must be a four-digit integer: ${value}`);
    }

    return parsedValue;
}

function withOptionalSourceBatchId(sourceBatchId?: string): {
    sourceBatchId?: string;
} {
    return sourceBatchId ? { sourceBatchId } : {};
}

function withOptionalVehicleType(vehicleType?: string): {
    vehicleType?: string;
} {
    return vehicleType ? { vehicleType } : {};
}
