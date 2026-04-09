import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

import { buildPreparedIdentifiersV1 } from './application/buildPreparedIdentifiersV1.js';
import { DEFAULT_INSTITUTIONAL_HOLDER_REGISTRY_V1 } from './domain/institutionalHolderRegistryV1.js';
import {
    normalizePartyIdentityV1,
    type NormalizePartyIdentityV1Input,
} from './domain/partyIdentityV1.js';
import {
    classifyInstitutionalHolderV1,
    resolveRecipientFromOwnershipV1,
} from './domain/recipientResolutionV1.js';
import {
    composePreparationInputV1,
    type ComposePreparationInputV1,
} from './application/composePreparationInputV1.js';
import {
    persistBatchOutcomeV1,
    type PreparedEvaluationWriteModelV1,
    type PreparedRecordWriteModelV1,
} from './application/persistBatchOutcomeV1.js';
import { runPreparationBatchV1 } from './application/runPreparationBatchV1.js';
import { runLocalPreparationDriverV1 } from './application/runLocalPreparationDriverV1.js';
import {
    buildPreparationEvaluationInsertValues,
    buildPreparedRecordInsertValues,
    INSERT_PREPARATION_EVALUATION_SQL,
    INSERT_PREPARED_RECORD_SQL,
    PostgresPreparationEvaluationWriter,
    PostgresPreparedRecordWriter,
    type PostgresSqlExecutor,
} from './infrastructure/postgres/PostgresBatchOutcomeWriters.js';
import { prepareReminderRecordV1, type PreparationInput } from './application/prepareReminderRecord.js';
import type {
    ContactProfile,
    FieldQuality,
    LinkageReason,
    LinkageStatus,
    PreparationReason,
    PreparationStatus,
    PrecedenceRule,
    ProvenancedField,
    RecipientResolutionStatus,
    TaxIdentityStatus,
    RevisionVerification,
    SourceTraceV1,
    VerificationStatus,
} from './domain/model.js';
import {
    toNormalizedAciContributionV1,
    toNormalizedYapContributionV1,
    toRevisionVerificationFromExternalInputV1,
    type AciCsvRowV1,
    type ExternalVerificationInputV1,
    type YapCsvRowV1,
} from './input/intakeV1.js';
import { linkAciToYapV1 } from './input/linkageV1.js';

interface GoldenScenario {
    name: string;
    note: string;
    input: PreparationInput;
    expectedStatus: PreparationStatus;
    expectedReasons: PreparationReason[];
    expectedRevisionRule: PrecedenceRule;
    expectedExternalVerificationUsed: boolean;
}

interface IntakeGoldenScenario {
    name: string;
    note: string;
    run: () => Record<string, unknown>;
}

interface LinkageGoldenScenario {
    name: string;
    note: string;
    aciRow: AciCsvRowV1;
    yapRows: YapCsvRowV1[];
    expectedStatus: LinkageStatus;
    expectedReason: LinkageReason;
}

interface ComposeGoldenScenario {
    name: string;
    note: string;
    input: ComposePreparationInputV1;
    expectedUsed: string[];
    expectedIgnored: string[];
    expectedStatus: PreparationStatus;
}

interface BatchGoldenScenario {
    name: string;
    note: string;
    run: () => Record<string, unknown>;
}

interface PersistenceGoldenScenario {
    name: string;
    note: string;
    run: () => Promise<Record<string, unknown>>;
}

interface LocalDriverGoldenScenario {
    name: string;
    note: string;
    run: () => Promise<Record<string, unknown>>;
}

interface PartyIdentityGoldenScenario {
    name: string;
    note: string;
    input: NormalizePartyIdentityV1Input;
    expectedPartyKind: 'natural_person' | 'sole_proprietorship' | 'organization';
    expectedTaxIdentityStatus: TaxIdentityStatus;
    expectedWarnings: string[];
}

interface InstitutionalRecipientGoldenScenario {
    name: string;
    note: string;
    run: () => Record<string, unknown>;
}

const baseTimestamps = {
    startedAt: '2026-04-08T09:00:00Z',
    createdAt: '2026-04-08T09:00:01Z',
};

const goldenScenarios: GoldenScenario[] = [
    {
        name: 'ready_with_verified_revision_and_yap_contact',
        note: 'ACI wins candidate and due context, YAP wins contact fields, Echoes remains the revision precedence because no external verification result contributes.',
        input: buildInput({
            revisionVerification: buildRevisionVerification('verified_current'),
        }),
        expectedStatus: 'ready',
        expectedReasons: ['record_prepared_with_deterministic_precedence'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'ready_with_contact_warning_on_stale_contact',
        note: 'YAP still wins the contact fields, but stale quality downgrades the final status to a warning outcome.',
        input: buildInput({
            contactProfile: buildContactProfile({
                phoneQuality: 'stale_suspected',
            }),
            revisionVerification: buildRevisionVerification('verified_current'),
        }),
        expectedStatus: 'ready_with_contact_warning',
        expectedReasons: ['contact_profile_contains_warning_quality'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'excluded_by_internal_echoes_revision',
        note: 'Echoes internal exclusion closes the case before any contact or external verification evaluation can reopen it.',
        input: buildInput({
            internalRevisionFound: true,
            revisionVerification: buildRevisionVerification('verified_current'),
        }),
        expectedStatus: 'excluded_internal_revision_found',
        expectedReasons: ['internal_revision_found_in_echoes'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'already_revised_elsewhere_from_external_verification',
        note: 'External Verification Adapter contributes and wins revision resolution because it already confirms revision elsewhere.',
        input: buildInput({
            revisionVerification: buildRevisionVerification(
                'already_revised_elsewhere',
                true,
            ),
            sourceTrace: buildSourceTrace(
                true,
                'already_revised_elsewhere',
            ),
        }),
        expectedStatus: 'already_revised_elsewhere',
        expectedReasons: ['external_verification_reports_already_revised'],
        expectedRevisionRule:
            'external_verification_adapter_revision_resolution_primary',
        expectedExternalVerificationUsed: true,
    },
    {
        name: 'insufficient_contact_data_blocks_preparation',
        note: 'The case stays deterministic, but without minimum contact data it must stop before any ready or verification outcome.',
        input: buildInput({
            contactProfile: buildContactProfile({
                nameValue: null,
                addressValue: null,
                postalCodeValue: null,
                cityValue: null,
                emailValue: null,
                phoneValue: null,
            }),
            revisionVerification: buildRevisionVerification('verified_current'),
        }),
        expectedStatus: 'insufficient_contact_data',
        expectedReasons: ['insufficient_contact_data'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'identity_mismatch_requires_review',
        note: 'Identity mismatch always wins first and prevents the layer from closing the case through readiness or verification.',
        input: buildInput({
            identityMismatchDetected: true,
            revisionVerification: buildRevisionVerification('verified_current'),
        }),
        expectedStatus: 'identity_mismatch_review_required',
        expectedReasons: ['identity_mismatch_detected'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'needs_external_verification_when_missing',
        note: 'The record has enough contact data, but revision state is unresolved because no external verification has yet contributed.',
        input: buildInput({
            revisionVerification: buildRevisionVerification('not_checked'),
        }),
        expectedStatus: 'needs_external_verification',
        expectedReasons: ['external_verification_missing_for_revision_state'],
        expectedRevisionRule: 'echoes_internal_revision_exclusion_primary',
        expectedExternalVerificationUsed: false,
    },
    {
        name: 'needs_external_verification_when_adapter_failed',
        note: 'The adapter has contributed, but revision resolution is still unresolved because verification failed.',
        input: buildInput({
            revisionVerification: buildRevisionVerification('check_failed', true),
            sourceTrace: buildSourceTrace(true, 'check_failed'),
        }),
        expectedStatus: 'needs_external_verification',
        expectedReasons: ['external_verification_failed_for_revision_state'],
        expectedRevisionRule:
            'external_verification_adapter_revision_resolution_primary',
        expectedExternalVerificationUsed: true,
    },
];

const intakeGoldenScenarios: IntakeGoldenScenario[] = [
    {
        name: 'aci_only_vehicle_identity_contribution',
        note: 'ACI alone must produce deterministic vehicle identity, due context, candidate provenance, and ACI precedence.',
        run: () => {
            const aciRow: AciCsvRowV1 = {
                sourceBatchId: 'batch-aci-010',
                sourceRowKey: 'aci-row-010',
                plate: 'ab 123 cd',
                vehicleType: 'Car',
                dueMonth: '04',
                dueYear: '2026',
                ownerName: 'Mario Rossi',
                addressLine: 'Via Roma 1',
                postalCode: '00100',
                city: 'Roma',
                province: 'RM',
            };

            const contribution = toNormalizedAciContributionV1(aciRow);

            assert.equal(contribution.vehicleIdentity.identityKey, 'AB123CD|car|2026-04');
            assert.equal(contribution.vehicleIdentity.plate, 'AB123CD');
            assert.equal(contribution.vehicleIdentity.dueMonth, 4);
            assert.equal(
                contribution.sourceTrace.appliedPrecedence.rule,
                'aci_candidate_due_context_primary',
            );
            assert.equal(
                contribution.sourceTrace.contributingRawRecord.sourceSystem,
                'aci_csv',
            );

            return {
                scenario: 'aci_only_vehicle_identity_contribution',
                identityKey: contribution.vehicleIdentity.identityKey,
                plate: contribution.vehicleIdentity.plate,
                dueMonth: contribution.vehicleIdentity.dueMonth,
                dueYear: contribution.vehicleIdentity.dueYear,
                precedenceRule: contribution.sourceTrace.appliedPrecedence.rule,
                provenanceSource:
                    contribution.sourceTrace.contributingRawRecord.sourceSystem,
                note: 'ACI only',
            };
        },
    },
    {
        name: 'aci_plus_yap_contact_contribution',
        note: 'YAP must supply the primary contact contribution while ACI remains the candidate and due source.',
        run: () => {
            const yapRow: YapCsvRowV1 = {
                sourceBatchId: 'batch-yap-011',
                sourceRowKey: 'yap-row-011',
                plate: 'AB123CD',
                vehicleType: 'car',
                contactName: 'Mario Rossi',
                addressLine: 'Via Milano 2',
                postalCode: '20100',
                city: 'Milano',
                province: 'MI',
                email: 'MARIO@EXAMPLE.COM',
                phone: '+39 333 1112233',
            };

            const contribution = toNormalizedYapContributionV1(yapRow);

            assert.equal(contribution.contactProfile.email.value, 'mario@example.com');
            assert.equal(contribution.contactProfile.phone.value, '+393331112233');
            assert.equal(contribution.contactProfile.name.source, 'yap_csv');
            assert.equal(contribution.contactProfile.matchConfidence, 'strong');
            assert.equal(
                contribution.sourceTrace.appliedPrecedence.rule,
                'yap_contact_primary',
            );

            return {
                scenario: 'aci_plus_yap_contact_contribution',
                contactName: contribution.contactProfile.name.value,
                email: contribution.contactProfile.email.value,
                phone: contribution.contactProfile.phone.value,
                matchConfidence: contribution.contactProfile.matchConfidence,
                precedenceRule: contribution.sourceTrace.appliedPrecedence.rule,
                provenanceSource:
                    contribution.sourceTrace.contributingRawRecord.sourceSystem,
                note: 'ACI + YAP',
            };
        },
    },
    {
        name: 'external_verification_input_to_revision_verification',
        note: 'External verification input must normalize directly to RevisionVerification with adapter provenance preserved.',
        run: () => {
            const verificationInput: ExternalVerificationInputV1 = {
                sourceBatchId: 'batch-ev-012',
                sourceRowKey: 'ev-row-012',
                verificationResultId: 'ev-result-012',
                plate: 'AB123CD',
                vehicleType: 'car',
                verificationStatus: 'already_revised_elsewhere',
                verificationChannel: 'manual_portale',
                verifiedAt: '2026-04-08T08:45:00Z',
                lastRevisionDate: '2026-03-10',
                note: 'operator checked external revision state',
            };

            const revisionVerification =
                toRevisionVerificationFromExternalInputV1(verificationInput);

            assert.equal(
                revisionVerification.verificationStatus,
                'already_revised_elsewhere',
            );
            assert.equal(
                revisionVerification.verificationSource,
                'external_verification_adapter',
            );
            assert.equal(
                revisionVerification.verificationTrace[0]?.sourceSystem,
                'external_verification_adapter',
            );

            return {
                scenario: 'external_verification_input_to_revision_verification',
                verificationStatus: revisionVerification.verificationStatus,
                verificationSource: revisionVerification.verificationSource,
                verificationChannel: revisionVerification.verificationChannel,
                traceSource:
                    revisionVerification.verificationTrace[0]?.sourceSystem ?? null,
                note: 'ACI + YAP + external verification result',
            };
        },
    },
    {
        name: 'intake_chain_with_visible_provenance',
        note: 'ACI, YAP, and external verification can be composed into one preparation input while keeping provenance and precedence explicit.',
        run: () => {
            const aciContribution = toNormalizedAciContributionV1({
                sourceBatchId: 'batch-aci-013',
                sourceRowKey: 'aci-row-013',
                plate: 'AB123CD',
                vehicleType: 'car',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
            });
            const yapContribution = toNormalizedYapContributionV1({
                sourceBatchId: 'batch-yap-013',
                sourceRowKey: 'yap-row-013',
                plate: 'AB123CD',
                vehicleType: 'car',
                contactName: 'Mario Rossi',
                addressLine: 'Via Milano 2',
                postalCode: '20100',
                city: 'Milano',
                province: 'MI',
                email: 'mario@example.com',
                phone: '+393331112233',
            });
            const revisionVerification = toRevisionVerificationFromExternalInputV1({
                sourceBatchId: 'batch-ev-013',
                sourceRowKey: 'ev-row-013',
                verificationResultId: 'ev-result-013',
                plate: 'AB123CD',
                vehicleType: 'car',
                verificationStatus: 'already_revised_elsewhere',
                verificationChannel: 'manual_portale',
                verifiedAt: '2026-04-08T08:45:00Z',
                lastRevisionDate: '2026-03-10',
            });

            const result = prepareReminderRecordV1({
                preparationEvaluationId: 'eval-intake-013',
                preparedRecordId: 'prepared-intake-013',
                preparedKey: 'prepared-intake-key-013',
                identityKey: aciContribution.vehicleIdentity.identityKey,
                vehicleIdentity: aciContribution.vehicleIdentity,
                contactProfile: yapContribution.contactProfile,
                revisionVerification,
                internalRevisionFound: false,
                identityMismatchDetected: false,
                sourceTrace: {
                    contributingRawRecords: [
                        aciContribution.sourceTrace.contributingRawRecord,
                        yapContribution.sourceTrace.contributingRawRecord,
                        {
                            sourceSystem: 'external_verification_adapter',
                            sourceBatchId: 'batch-ev-013',
                            sourceRowKey: 'ev-row-013',
                            role: 'external_verification_result',
                        },
                    ],
                    winningFieldSources: [],
                    externalVerification: {
                        sourceSystem: 'external_verification_adapter',
                        verificationResultId: 'ev-result-013',
                        verificationStatus: 'already_revised_elsewhere',
                        verificationChannel: 'manual_portale',
                    },
                    appliedPrecedences: [
                        aciContribution.sourceTrace.appliedPrecedence,
                        yapContribution.sourceTrace.appliedPrecedence,
                    ],
                    finalStatusReasons: [],
                },
                ...baseTimestamps,
            });

            assert.equal(
                result.evaluation.preparationStatus,
                'already_revised_elsewhere',
            );
            assert.deepEqual(result.evaluation.preparationReasons, [
                'external_verification_reports_already_revised',
            ]);
            assert.equal(
                result.evaluation.sourceTrace.contributingRawRecords.length,
                3,
            );

            return {
                scenario: 'intake_chain_with_visible_provenance',
                status: result.evaluation.preparationStatus,
                reasons: result.evaluation.preparationReasons,
                contributingSources: result.evaluation.sourceTrace.contributingRawRecords.map(
                    (record) => record.sourceSystem,
                ),
                precedenceRules: result.evaluation.sourceTrace.appliedPrecedences.map(
                    (precedence) => precedence.rule,
                ),
                note: 'provenance remains visible across ACI + YAP + external verification',
            };
        },
    },
];

const linkageGoldenScenarios: LinkageGoldenScenario[] = [
    {
        name: 'exact_plate_match_linked',
        note: 'Exact normalized plate is enough to link when no support field rejects the candidate.',
        aciRow: {
            sourceRowKey: 'aci-link-001',
            plate: 'AB123CD',
            vehicleType: 'car',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-001',
                plate: 'AB123CD',
                contactName: 'Mario Rossi',
            },
        ],
        expectedStatus: 'linked',
        expectedReason: 'exact_plate_match',
    },
    {
        name: 'plate_and_vehicle_type_match_linked',
        note: 'Vehicle type supports and confirms the strong plate linkage.',
        aciRow: {
            sourceRowKey: 'aci-link-002',
            plate: 'AB123CD',
            vehicleType: 'car',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-002',
                plate: 'AB123CD',
                vehicleType: 'car',
                email: 'mario@example.com',
            },
        ],
        expectedStatus: 'linked',
        expectedReason: 'exact_plate_and_vehicle_type_match',
    },
    {
        name: 'same_plate_conflicting_due_context_ambiguous',
        note: 'Due context is support-only, but when it explicitly conflicts it prevents a confident link.',
        aciRow: {
            sourceRowKey: 'aci-link-003',
            plate: 'AB123CD',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-003',
                plate: 'AB123CD',
                dueMonth: 5,
                dueYear: 2026,
                phone: '+393331112233',
            },
        ],
        expectedStatus: 'ambiguous',
        expectedReason: 'due_context_conflict',
    },
    {
        name: 'missing_plate_on_yap_not_linked',
        note: 'Name or phone alone can explain affinity, but without plate they never become identity linkage in v1.',
        aciRow: {
            sourceRowKey: 'aci-link-004',
            plate: 'AB123CD',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-004',
                contactName: 'Mario Rossi',
                phone: '+393331112233',
            },
        ],
        expectedStatus: 'not_linked',
        expectedReason: 'insufficient_linkage_evidence',
    },
    {
        name: 'multiple_yap_rows_same_plate_ambiguous',
        note: 'Multiple YAP rows with the same strong plate remain ambiguous when support fields do not uniquely disambiguate.',
        aciRow: {
            sourceRowKey: 'aci-link-005',
            plate: 'AB123CD',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-005a',
                plate: 'AB123CD',
                contactName: 'Mario Rossi',
            },
            {
                sourceRowKey: 'yap-link-005b',
                plate: 'AB123CD',
                email: 'mario@example.com',
            },
        ],
        expectedStatus: 'ambiguous',
        expectedReason: 'multiple_yap_rows_same_plate',
    },
    {
        name: 'vehicle_type_conflict_rejected',
        note: 'Vehicle type never links on its own, but a direct conflict can reject an otherwise exact plate candidate.',
        aciRow: {
            sourceRowKey: 'aci-link-006',
            plate: 'AB123CD',
            vehicleType: 'car',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-006',
                plate: 'AB123CD',
                vehicleType: 'motorcycle',
                phone: '+393331112233',
            },
        ],
        expectedStatus: 'rejected',
        expectedReason: 'vehicle_type_conflict',
    },
    {
        name: 'insufficient_linkage_evidence_not_linked',
        note: 'Rows with no matching plate and only support fields remain prudently not linked.',
        aciRow: {
            sourceRowKey: 'aci-link-007',
            plate: 'AB123CD',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-007',
                plate: 'ZZ999ZZ',
                email: 'mario@example.com',
            },
        ],
        expectedStatus: 'not_linked',
        expectedReason: 'no_plate_match',
    },
    {
        name: 'multiple_plate_matches_resolved_by_due_context',
        note: 'Due month and year can disambiguate between multiple same-plate YAP rows without becoming identity primary.',
        aciRow: {
            sourceRowKey: 'aci-link-008',
            plate: 'AB123CD',
            dueMonth: 4,
            dueYear: 2026,
        },
        yapRows: [
            {
                sourceRowKey: 'yap-link-008a',
                plate: 'AB123CD',
                dueMonth: 5,
                dueYear: 2026,
                contactName: 'Old contact',
            },
            {
                sourceRowKey: 'yap-link-008b',
                plate: 'AB123CD',
                dueMonth: 4,
                dueYear: 2026,
                contactName: 'Current contact',
            },
        ],
        expectedStatus: 'linked',
        expectedReason: 'exact_plate_with_due_context_support',
    },
];

const composeGoldenScenarios: ComposeGoldenScenario[] = [
    {
        name: 'compose_aci_only_minimal',
        note: 'ACI alone composes the vehicle base and ACI fallback contact hint, leading to external verification need when revision is still open.',
        input: {
            preparationEvaluationId: 'compose-001',
            preparedRecordId: 'compose-prepared-001',
            preparedKey: 'compose-key-001',
            startedAt: '2026-04-08T10:00:00Z',
            createdAt: '2026-04-08T10:00:01Z',
            aciContribution: toNormalizedAciContributionV1({
                sourceBatchId: 'batch-aci-compose-001',
                sourceRowKey: 'aci-compose-001',
                plate: 'AB123CD',
                vehicleType: 'car',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
                addressLine: 'Via Roma 1',
                postalCode: '00100',
                city: 'Roma',
                province: 'RM',
            }),
        },
        expectedUsed: ['aci_candidate_due_context', 'aci_contact_hint_fallback'],
        expectedIgnored: [],
        expectedStatus: 'needs_external_verification',
    },
    {
        name: 'compose_aci_plus_linked_yap',
        note: 'Linked YAP contributes the winning contact profile while ACI remains the vehicle and due-context source.',
        input: buildComposeInputWithLinkedYap('verified_current'),
        expectedUsed: [
            'aci_candidate_due_context',
            'yap_contact_enrichment',
            'external_verification_result',
        ],
        expectedIgnored: [],
        expectedStatus: 'ready',
    },
    {
        name: 'compose_aci_plus_ambiguous_yap',
        note: 'Ambiguous linkage must not silently inject YAP contact enrichment into the compose result.',
        input: {
            preparationEvaluationId: 'compose-003',
            preparedRecordId: 'compose-prepared-003',
            preparedKey: 'compose-key-003',
            startedAt: '2026-04-08T10:00:00Z',
            createdAt: '2026-04-08T10:00:01Z',
            aciContribution: toNormalizedAciContributionV1({
                sourceBatchId: 'batch-aci-compose-003',
                sourceRowKey: 'aci-compose-003',
                plate: 'AB123CD',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
                addressLine: 'Via Roma 1',
                postalCode: '00100',
                city: 'Roma',
                province: 'RM',
            }),
            yapLinkageResult: linkAciToYapV1(
                {
                    sourceRowKey: 'aci-link-compose-003',
                    plate: 'AB123CD',
                    dueMonth: 4,
                    dueYear: 2026,
                },
                [
                    {
                        sourceRowKey: 'yap-link-compose-003a',
                        plate: 'AB123CD',
                        contactName: 'Mario Rossi',
                    },
                    {
                        sourceRowKey: 'yap-link-compose-003b',
                        plate: 'AB123CD',
                        email: 'mario@example.com',
                    },
                ],
            ),
        },
        expectedUsed: ['aci_candidate_due_context', 'aci_contact_hint_fallback'],
        expectedIgnored: [
            'yap_contact_enrichment_ignored_ambiguous_multiple_yap_rows_same_plate',
        ],
        expectedStatus: 'needs_external_verification',
    },
    {
        name: 'compose_with_echoes_internal_revision',
        note: 'Echoes internal revision state enters explicitly and drives the exclusion path.',
        input: {
            preparationEvaluationId: 'compose-004',
            preparedRecordId: 'compose-prepared-004',
            preparedKey: 'compose-key-004',
            startedAt: '2026-04-08T10:00:00Z',
            createdAt: '2026-04-08T10:00:01Z',
            aciContribution: toNormalizedAciContributionV1({
                sourceBatchId: 'batch-aci-compose-004',
                sourceRowKey: 'aci-compose-004',
                plate: 'AB123CD',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
            }),
            echoesState: {
                internalRevisionFound: true,
                sourceBatchId: 'batch-echoes-compose-004',
                sourceRowKey: 'echoes-compose-004',
                note: 'internal revision found in echoes',
            },
        },
        expectedUsed: [
            'aci_candidate_due_context',
            'aci_contact_hint_fallback',
            'echoes_internal_revision_state',
        ],
        expectedIgnored: [],
        expectedStatus: 'excluded_internal_revision_found',
    },
    {
        name: 'compose_with_external_already_revised',
        note: 'External verification enters the compose result and closes the case before readiness.',
        input: buildComposeInputWithLinkedYap('already_revised_elsewhere'),
        expectedUsed: [
            'aci_candidate_due_context',
            'yap_contact_enrichment',
            'external_verification_result',
        ],
        expectedIgnored: [],
        expectedStatus: 'already_revised_elsewhere',
    },
    {
        name: 'compose_with_linked_yap_and_open_revision',
        note: 'Linked YAP enters, but without internal or external closure the composed input still leads to needs_external_verification.',
        input: {
            preparationEvaluationId: 'compose-006',
            preparedRecordId: 'compose-prepared-006',
            preparedKey: 'compose-key-006',
            startedAt: '2026-04-08T10:00:00Z',
            createdAt: '2026-04-08T10:00:01Z',
            aciContribution: toNormalizedAciContributionV1({
                sourceBatchId: 'batch-aci-compose-006',
                sourceRowKey: 'aci-compose-006',
                plate: 'AB123CD',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
            }),
            yapLinkageResult: {
                linkageStatus: 'linked',
                linkageReason: 'exact_plate_match',
                matchedCandidate: {
                    sourceRowKey: 'yap-compose-006',
                    plate: 'AB123CD',
                    email: 'mario@example.com',
                },
                criteriaUsed: ['plate_exact', 'email_support_present'],
                matchedCandidatesCount: 1,
                supportFieldsUsed: ['email'],
                note: 'linked by exact plate',
            },
            linkedYapContribution: toNormalizedYapContributionV1({
                sourceBatchId: 'batch-yap-compose-006',
                sourceRowKey: 'yap-compose-006',
                plate: 'AB123CD',
                email: 'mario@example.com',
            }),
        },
        expectedUsed: ['aci_candidate_due_context', 'yap_contact_enrichment'],
        expectedIgnored: [],
        expectedStatus: 'needs_external_verification',
    },
];

const batchGoldenScenarios: BatchGoldenScenario[] = [
    {
        name: 'batch_single_aci_ready',
        note: 'One ACI row with ready external verification should produce one ready evaluation and one prepared record.',
        run: () => {
            const result = runPreparationBatchV1({
                batchRunId: 'batch-run-001',
                startedAt: '2026-04-08T11:00:00Z',
                createdAt: '2026-04-08T11:00:01Z',
                aciRows: [
                    {
                        sourceBatchId: 'batch-aci-batch-001',
                        sourceRowKey: 'aci-batch-001',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [],
                getExternalVerificationInput: () => ({
                    sourceBatchId: 'batch-ev-batch-001',
                    sourceRowKey: 'ev-batch-001',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T10:30:00Z',
                    lastRevisionDate: '2026-03-10',
                }),
            });

            assert.equal(result.processedCount, 1);
            assert.equal(result.preparedCount, 1);
            assert.equal(result.statusCounts.ready, 1);
            assert.equal(
                result.recordOutcomes[0]?.evaluation.preparationStatus,
                'ready',
            );
            assert.equal(
                result.recordOutcomes[0]?.linkageResult.linkageStatus,
                'not_linked',
            );

            return {
                scenario: 'batch_single_aci_ready',
                processedCount: result.processedCount,
                preparedCount: result.preparedCount,
                statusCounts: result.statusCounts,
                linkageStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.linkageResult.linkageStatus,
                ),
                finalStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.evaluation.preparationStatus,
                ),
                note: 'batch with one ready ACI candidate',
            };
        },
    },
    {
        name: 'batch_aci_with_linked_yap_ready',
        note: 'Linked YAP enrichment should enter one batch record and keep prepared count aligned.',
        run: () => {
            const result = runPreparationBatchV1({
                batchRunId: 'batch-run-002',
                startedAt: '2026-04-08T11:00:00Z',
                createdAt: '2026-04-08T11:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-batch-002',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                    },
                ],
                yapRows: [
                    {
                        sourceRowKey: 'yap-batch-002',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        contactName: 'Mario Rossi',
                        addressLine: 'Via Milano 2',
                        postalCode: '20100',
                        city: 'Milano',
                        email: 'mario@example.com',
                        phone: '+393331112233',
                    },
                ],
                getExternalVerificationInput: () => ({
                    sourceRowKey: 'ev-batch-002',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T10:30:00Z',
                    lastRevisionDate: '2026-03-10',
                }),
            });

            assert.equal(result.preparedCount, 1);
            assert.equal(result.statusCounts.ready, 1);
            assert.equal(
                result.recordOutcomes[0]?.linkageResult.linkageStatus,
                'linked',
            );
            assert.ok(
                result.recordOutcomes[0]?.usedContributions.includes(
                    'yap_contact_enrichment',
                ),
            );

            return {
                scenario: 'batch_aci_with_linked_yap_ready',
                processedCount: result.processedCount,
                preparedCount: result.preparedCount,
                statusCounts: result.statusCounts,
                linkageStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.linkageResult.linkageStatus,
                ),
                usedContributions: result.recordOutcomes.map(
                    (outcome) => outcome.usedContributions,
                ),
                finalStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.evaluation.preparationStatus,
                ),
                note: 'batch with linked YAP enrichment',
            };
        },
    },
    {
        name: 'batch_aci_excluded_by_echoes',
        note: 'Echoes internal revision state should drive exclusion in batch mode as well.',
        run: () => {
            const result = runPreparationBatchV1({
                batchRunId: 'batch-run-003',
                startedAt: '2026-04-08T11:00:00Z',
                createdAt: '2026-04-08T11:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-batch-003',
                        plate: 'AB123CD',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                    },
                ],
                yapRows: [],
                getEchoesState: () => ({
                    internalRevisionFound: true,
                    sourceRowKey: 'echoes-batch-003',
                }),
            });

            assert.equal(result.preparedCount, 0);
            assert.equal(result.statusCounts.excluded_internal_revision_found, 1);

            return {
                scenario: 'batch_aci_excluded_by_echoes',
                processedCount: result.processedCount,
                preparedCount: result.preparedCount,
                statusCounts: result.statusCounts,
                linkageStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.linkageResult.linkageStatus,
                ),
                finalStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.evaluation.preparationStatus,
                ),
                note: 'batch with echoes-driven exclusion',
            };
        },
    },
    {
        name: 'batch_aci_requires_external_verification',
        note: 'Without external closure, the batch must surface the verification-needed path deterministically.',
        run: () => {
            const result = runPreparationBatchV1({
                batchRunId: 'batch-run-004',
                startedAt: '2026-04-08T11:00:00Z',
                createdAt: '2026-04-08T11:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-batch-004',
                        plate: 'AB123CD',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [],
            });

            assert.equal(result.preparedCount, 0);
            assert.equal(result.statusCounts.needs_external_verification, 1);

            return {
                scenario: 'batch_aci_requires_external_verification',
                processedCount: result.processedCount,
                preparedCount: result.preparedCount,
                statusCounts: result.statusCounts,
                linkageStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.linkageResult.linkageStatus,
                ),
                finalStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.evaluation.preparationStatus,
                ),
                note: 'batch with external verification still open',
            };
        },
    },
    {
        name: 'batch_aci_with_ambiguous_yap_ignored',
        note: 'Ambiguous YAP rows must stay visible in the batch outcome but never enrich the record silently.',
        run: () => {
            const result = runPreparationBatchV1({
                batchRunId: 'batch-run-005',
                startedAt: '2026-04-08T11:00:00Z',
                createdAt: '2026-04-08T11:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-batch-005',
                        plate: 'AB123CD',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [
                    {
                        sourceRowKey: 'yap-batch-005a',
                        plate: 'AB123CD',
                        contactName: 'Mario Rossi',
                    },
                    {
                        sourceRowKey: 'yap-batch-005b',
                        plate: 'AB123CD',
                        email: 'mario@example.com',
                    },
                ],
            });

            assert.equal(result.preparedCount, 0);
            assert.equal(result.statusCounts.needs_external_verification, 1);
            assert.equal(
                result.recordOutcomes[0]?.linkageResult.linkageStatus,
                'ambiguous',
            );
            assert.ok(
                result.recordOutcomes[0]?.ignoredContributions.includes(
                    'yap_contact_enrichment_ignored_ambiguous_multiple_yap_rows_same_plate',
                ),
            );

            return {
                scenario: 'batch_aci_with_ambiguous_yap_ignored',
                processedCount: result.processedCount,
                preparedCount: result.preparedCount,
                statusCounts: result.statusCounts,
                linkageStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.linkageResult.linkageStatus,
                ),
                ignoredContributions: result.recordOutcomes.map(
                    (outcome) => outcome.ignoredContributions,
                ),
                finalStatuses: result.recordOutcomes.map(
                    (outcome) => outcome.evaluation.preparationStatus,
                ),
                note: 'batch with ambiguous YAP ignored',
            };
        },
    },
];

const persistenceGoldenScenarios: PersistenceGoldenScenario[] = [
    {
        name: 'persistence_dry_run_with_ready_record',
        note: 'Dry run must expose both evaluation and prepared record payloads without writing anything.',
        run: async () => {
            const aciContribution = toNormalizedAciContributionV1({
                sourceRowKey: 'aci-persist-001',
                plate: 'AB123CD',
                vehicleType: 'car',
                dueMonth: 4,
                dueYear: 2026,
                ownerName: 'Mario Rossi',
                addressLine: 'Via Roma 1',
                postalCode: '00100',
                city: 'Roma',
            });
            const preparedIdentifiers = buildPreparedIdentifiersV1({
                batchRunId: 'persist-batch-001',
                aciSourceRowKey: 'aci-persist-001',
                aciContribution,
                linkedYapContribution: null,
                externalVerificationInput: {
                    sourceRowKey: 'ev-persist-001',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T11:30:00Z',
                    lastRevisionDate: '2026-03-10',
                },
            });

            assert.equal(
                preparedIdentifiers.preparedRecordId,
                'persist-batch-001|prepared|aci-persist-001',
            );

            const batchResult = runPreparationBatchV1({
                batchRunId: 'persist-batch-001',
                startedAt: '2026-04-08T12:00:00Z',
                createdAt: '2026-04-08T12:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-persist-001',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [],
                getExternalVerificationInput: () => ({
                    sourceRowKey: 'ev-persist-001',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T11:30:00Z',
                    lastRevisionDate: '2026-03-10',
                }),
            });
            const persistResult = await persistBatchOutcomeV1({
                mode: 'dry_run',
                batchResult,
            });

            assert.equal(persistResult.evaluationCount, 1);
            assert.equal(persistResult.preparedRecordCount, 1);
            assert.equal(persistResult.appliedEvaluationCount, 0);
            assert.equal(persistResult.appliedPreparedRecordCount, 0);

            return {
                scenario: 'persistence_dry_run_with_ready_record',
                mode: persistResult.mode,
                evaluationCount: persistResult.evaluationCount,
                preparedRecordCount: persistResult.preparedRecordCount,
                appliedEvaluationCount: persistResult.appliedEvaluationCount,
                appliedPreparedRecordCount: persistResult.appliedPreparedRecordCount,
                preparedRecordId: preparedIdentifiers.preparedRecordId,
                preparationStatuses: persistResult.evaluationWrites.map(
                    (write) => write.preparationStatus,
                ),
                note: 'dry run with ready record',
            };
        },
    },
    {
        name: 'persistence_dry_run_without_prepared_record',
        note: 'Dry run must keep the one-evaluation to zero-prepared cardinality explicit.',
        run: async () => {
            const batchResult = runPreparationBatchV1({
                batchRunId: 'persist-batch-002',
                startedAt: '2026-04-08T12:00:00Z',
                createdAt: '2026-04-08T12:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-persist-002',
                        plate: 'AB123CD',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [],
            });
            const persistResult = await persistBatchOutcomeV1({
                mode: 'dry_run',
                batchResult,
            });

            assert.equal(persistResult.evaluationCount, 1);
            assert.equal(persistResult.preparedRecordCount, 0);

            return {
                scenario: 'persistence_dry_run_without_prepared_record',
                mode: persistResult.mode,
                evaluationCount: persistResult.evaluationCount,
                preparedRecordCount: persistResult.preparedRecordCount,
                preparationStatuses: persistResult.evaluationWrites.map(
                    (write) => write.preparationStatus,
                ),
                note: 'dry run with no prepared record',
            };
        },
    },
    {
        name: 'persistence_apply_writes_evaluation_and_prepared_record',
        note: 'Apply mode must hand statement-ready payloads to the writers for both evaluation and prepared record.',
        run: async () => {
            const evaluationWrites: PreparedEvaluationWriteModelV1[] = [];
            const preparedRecordWrites: PreparedRecordWriteModelV1[] = [];
            const batchResult = runPreparationBatchV1({
                batchRunId: 'persist-batch-003',
                startedAt: '2026-04-08T12:00:00Z',
                createdAt: '2026-04-08T12:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-persist-003',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [
                    {
                        sourceRowKey: 'yap-persist-003',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        email: 'mario@example.com',
                        phone: '+393331112233',
                    },
                ],
                getExternalVerificationInput: () => ({
                    sourceRowKey: 'ev-persist-003',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T11:30:00Z',
                    lastRevisionDate: '2026-03-10',
                }),
            });
            const persistResult = await persistBatchOutcomeV1({
                mode: 'apply',
                batchResult,
                evaluationWriter: {
                    writePreparationEvaluation(model) {
                        evaluationWrites.push(model);
                    },
                },
                preparedRecordWriter: {
                    writePreparedRecord(model) {
                        preparedRecordWrites.push(model);
                    },
                },
            });

            assert.equal(persistResult.appliedEvaluationCount, 1);
            assert.equal(persistResult.appliedPreparedRecordCount, 1);
            assert.equal(evaluationWrites.length, 1);
            assert.equal(preparedRecordWrites.length, 1);
            assert.equal(
                preparedRecordWrites[0]?.preparationEvaluationId,
                evaluationWrites[0]?.preparationEvaluationId,
            );

            return {
                scenario: 'persistence_apply_writes_evaluation_and_prepared_record',
                mode: persistResult.mode,
                evaluationCount: persistResult.evaluationCount,
                preparedRecordCount: persistResult.preparedRecordCount,
                appliedEvaluationCount: persistResult.appliedEvaluationCount,
                appliedPreparedRecordCount: persistResult.appliedPreparedRecordCount,
                evaluationIds: evaluationWrites.map(
                    (write) => write.preparationEvaluationId,
                ),
                preparedRecordIds: preparedRecordWrites.map(
                    (write) => write.preparedRecordId,
                ),
                note: 'apply mode with statement-ready payloads',
            };
        },
    },
    {
        name: 'persistence_counts_preserve_1_to_0_or_1_cardinality',
        note: 'Persistence flow must preserve one evaluation per processed ACI record and zero-or-one prepared record per evaluation.',
        run: async () => {
            const batchResult = runPreparationBatchV1({
                batchRunId: 'persist-batch-004',
                startedAt: '2026-04-08T12:00:00Z',
                createdAt: '2026-04-08T12:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-persist-004a',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                    {
                        sourceRowKey: 'aci-persist-004b',
                        plate: 'ZX987YT',
                        dueMonth: 5,
                        dueYear: 2026,
                        ownerName: 'Luigi Bianchi',
                        addressLine: 'Via Napoli 3',
                        postalCode: '80100',
                        city: 'Napoli',
                    },
                ],
                yapRows: [],
                getExternalVerificationInput: ({ aciRow }) =>
                    aciRow.sourceRowKey === 'aci-persist-004a'
                        ? {
                              sourceRowKey: 'ev-persist-004a',
                              plate: 'AB123CD',
                              vehicleType: 'car',
                              verificationStatus: 'verified_current',
                              verificationChannel: 'manual_portale',
                              verifiedAt: '2026-04-08T11:30:00Z',
                              lastRevisionDate: '2026-03-10',
                          }
                        : undefined,
            });
            const persistResult = await persistBatchOutcomeV1({
                mode: 'dry_run',
                batchResult,
            });

            assert.equal(persistResult.evaluationCount, 2);
            assert.equal(persistResult.preparedRecordCount, 1);

            return {
                scenario: 'persistence_counts_preserve_1_to_0_or_1_cardinality',
                mode: persistResult.mode,
                evaluationCount: persistResult.evaluationCount,
                preparedRecordCount: persistResult.preparedRecordCount,
                preparationStatuses: persistResult.evaluationWrites.map(
                    (write) => write.preparationStatus,
                ),
                note: 'one evaluation per ACI row, zero-or-one prepared record per evaluation',
            };
        },
    },
    {
        name: 'persistence_apply_with_postgres_sql_writer',
        note: 'Apply mode can bind directly to explicit PostgreSQL INSERT statements with stable parameter ordering.',
        run: async () => {
            const calls: Array<{ text: string; values: readonly unknown[] }> = [];
            const executor: PostgresSqlExecutor = {
                async query(text, values) {
                    calls.push({ text: text.trim(), values });
                    return {};
                },
            };
            const batchResult = runPreparationBatchV1({
                batchRunId: 'persist-batch-005',
                startedAt: '2026-04-08T12:00:00Z',
                createdAt: '2026-04-08T12:00:01Z',
                aciRows: [
                    {
                        sourceRowKey: 'aci-persist-005',
                        plate: 'AB123CD',
                        vehicleType: 'car',
                        dueMonth: 4,
                        dueYear: 2026,
                        ownerName: 'Mario Rossi',
                        addressLine: 'Via Roma 1',
                        postalCode: '00100',
                        city: 'Roma',
                    },
                ],
                yapRows: [],
                getExternalVerificationInput: () => ({
                    sourceRowKey: 'ev-persist-005',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    verificationStatus: 'verified_current',
                    verificationChannel: 'manual_portale',
                    verifiedAt: '2026-04-08T11:30:00Z',
                    lastRevisionDate: '2026-03-10',
                }),
            });
            const persistResult = await persistBatchOutcomeV1({
                mode: 'apply',
                batchResult,
                evaluationWriter: new PostgresPreparationEvaluationWriter(
                    executor,
                ),
                preparedRecordWriter: new PostgresPreparedRecordWriter(executor),
            });

            assert.equal(calls.length, 2);
            assert.equal(
                calls[0]?.text,
                INSERT_PREPARATION_EVALUATION_SQL.trim(),
            );
            assert.equal(calls[1]?.text, INSERT_PREPARED_RECORD_SQL.trim());

            const expectedEvaluationValues = buildPreparationEvaluationInsertValues(
                persistResult.evaluationWrites[0]!,
            );
            const expectedPreparedRecordValues = buildPreparedRecordInsertValues(
                persistResult.preparedRecordWrites[0]!,
            );

            assert.deepEqual(calls[0]?.values, expectedEvaluationValues);
            assert.deepEqual(calls[1]?.values, expectedPreparedRecordValues);
            assert.equal(
                calls[0]?.values[0],
                persistResult.evaluationWrites[0]?.preparationEvaluationId,
            );
            assert.equal(
                calls[1]?.values[1],
                persistResult.preparedRecordWrites[0]?.preparationEvaluationId,
            );

            return {
                scenario: 'persistence_apply_with_postgres_sql_writer',
                mode: persistResult.mode,
                sqlCalls: calls.length,
                firstStatement: calls[0]?.text.split('\n')[0] ?? null,
                secondStatement: calls[1]?.text.split('\n')[0] ?? null,
                evaluationParamCount: calls[0]?.values.length ?? 0,
                preparedRecordParamCount: calls[1]?.values.length ?? 0,
                note: 'explicit SQL writer with stable parameter ordering',
            };
        },
    },
];

const localDriverGoldenScenarios: LocalDriverGoldenScenario[] = [
    {
        name: 'local_driver_reads_controlled_files',
        note: 'The local driver can read controlled CSV files plus local mocks and produce a readable replayable summary.',
        run: async () => {
            const result = await runLocalPreparationDriverV1({
                aciCsvPath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1\\aci.csv',
                yapCsvPath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1\\yap.csv',
                mocksFilePath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1\\mocks.json',
                mode: 'dry_run',
                batchRunId: 'local-driver-batch-001',
                startedAt: '2026-04-08T13:00:00Z',
                createdAt: '2026-04-08T13:00:01Z',
            });

            assert.equal(result.summary.processedCount, 2);
            assert.equal(result.summary.preparedCount, 1);
            assert.equal(result.summary.statusCounts.ready, 1);
            assert.equal(
                result.summary.statusCounts.excluded_internal_revision_found,
                1,
            );
            assert.equal(result.summary.dryRunPayloadCount, 3);

            return {
                scenario: 'local_driver_reads_controlled_files',
                processedCount: result.summary.processedCount,
                preparedCount: result.summary.preparedCount,
                statusCounts: result.summary.statusCounts,
                recordsNeedingAttention: result.summary.recordsNeedingAttention,
                recordsExcluded: result.summary.recordsExcluded,
                dryRunPayloadCount: result.summary.dryRunPayloadCount,
                note: 'driver on controlled local files',
            };
        },
    },
    {
        name: 'local_driver_handles_realistic_headers_and_row_errors',
        note: 'The local driver accepts small realistic header aliases, skips malformed rows, and can emit a JSON report.',
        run: async () => {
            const reportPath =
                'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1-realistic\\driver-report-golden.json';
            const result = await runLocalPreparationDriverV1({
                aciCsvPath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1-realistic\\aci.csv',
                yapCsvPath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1-realistic\\yap.csv',
                mocksFilePath:
                    'C:\\Projects\\reminder-preparation-fusion-layer-v1\\fixtures\\local-driver-v1-realistic\\mocks.json',
                mode: 'dry_run',
                batchRunId: 'local-driver-batch-002',
                startedAt: '2026-04-08T13:10:00Z',
                createdAt: '2026-04-08T13:10:01Z',
            });

            await writeFile(reportPath, JSON.stringify(result, null, 2), 'utf8');
            const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
                summary: { rowErrorCount: number; preparedCount: number };
            };

            assert.equal(result.summary.processedCount, 2);
            assert.equal(result.summary.preparedCount, 1);
            assert.equal(result.summary.rowSkippedCount, 1);
            assert.equal(result.summary.rowErrorCount, 1);
            assert.equal(report.summary.rowErrorCount, 1);

            return {
                scenario: 'local_driver_handles_realistic_headers_and_row_errors',
                processedCount: result.summary.processedCount,
                preparedCount: result.summary.preparedCount,
                rowSkippedCount: result.summary.rowSkippedCount,
                rowErrorCount: result.summary.rowErrorCount,
                aciHeaderMapping: result.inputDiagnostics.aciHeaderMapping,
                note: 'driver on realistic files with alias headers and one malformed row',
            };
        },
    },
];

const partyIdentityGoldenScenarios: PartyIdentityGoldenScenario[] = [
    {
        name: 'natural_person_with_only_codice_fiscale',
        note: 'Natural person keeps the fiscal identifier separate from contact data and can live with only codice fiscale.',
        input: {
            partyKind: 'natural_person',
            givenName: ' Mario ',
            familyName: ' Rossi ',
            codiceFiscale: ' rssmra80a01h501u ',
            sourceTrace: [
                {
                    sourceSystem: 'aci_csv',
                    sourceRowKey: 'party-row-001',
                    note: 'subject identity observed on ACI candidate row',
                },
            ],
        },
        expectedPartyKind: 'natural_person',
        expectedTaxIdentityStatus: 'codice_fiscale_only',
        expectedWarnings: [],
    },
    {
        name: 'organization_with_only_partita_iva',
        note: 'Organization identity can be represented with only partita IVA and a business display name.',
        input: {
            partyKind: 'organization',
            businessName: ' Alfa Trasporti Srl ',
            partitaIva: ' 123 456 789 01 ',
            sourceTrace: [
                {
                    sourceSystem: 'yap_csv',
                    sourceRowKey: 'party-row-002',
                    note: 'business identity observed on YAP contact row',
                },
            ],
        },
        expectedPartyKind: 'organization',
        expectedTaxIdentityStatus: 'partita_iva_only',
        expectedWarnings: [],
    },
    {
        name: 'sole_proprietorship_with_codice_fiscale_and_partita_iva',
        note: 'Sole proprietorship explicitly carries both codice fiscale and partita IVA without collapsing them into one taxId.',
        input: {
            partyKind: 'sole_proprietorship',
            givenName: ' Lucia ',
            familyName: ' Bianchi ',
            businessName: ' Bianchi Impianti ',
            codiceFiscale: 'bnclcu80a41f205x',
            partitaIva: '01234567890',
            sourceTrace: [
                {
                    sourceSystem: 'aci_csv',
                    sourceRowKey: 'party-row-003',
                    note: 'sole proprietorship subject observed on ACI row',
                },
            ],
        },
        expectedPartyKind: 'sole_proprietorship',
        expectedTaxIdentityStatus: 'codice_fiscale_and_partita_iva',
        expectedWarnings: [],
    },
    {
        name: 'sole_proprietorship_with_missing_partita_iva',
        note: 'Sole proprietorship can remain explicit even when one tax identifier is missing, without forced substitution.',
        input: {
            partyKind: 'sole_proprietorship',
            displayName: 'Officina Verdi',
            codiceFiscale: 'VRDGPP80A01H501U',
            sourceTrace: [
                {
                    sourceSystem: 'aci_csv',
                    sourceRowKey: 'party-row-004',
                    note: 'sole proprietorship subject with only codice fiscale available',
                },
            ],
        },
        expectedPartyKind: 'sole_proprietorship',
        expectedTaxIdentityStatus: 'codice_fiscale_only',
        expectedWarnings: [],
    },
];

const institutionalRecipientGoldenScenarios: InstitutionalRecipientGoldenScenario[] = [
    {
        name: 'non_institutional_owner_retained',
        note: 'A normal registral holder stays the final recipient when no institutional registry match exists.',
        run: () => {
            const owner = normalizePartyIdentityV1({
                partyKind: 'natural_person',
                displayName: 'Mario Rossi',
                codiceFiscale: 'RSSMRA80A01H501U',
                sourceTrace: [
                    {
                        sourceSystem: 'aci_csv',
                        sourceRowKey: 'holder-row-001',
                        note: 'registered owner from ACI',
                    },
                ],
            });
            const resolution = resolveRecipientFromOwnershipV1({
                registeredOwner: owner,
                registryEntries: DEFAULT_INSTITUTIONAL_HOLDER_REGISTRY_V1,
            });

            assert.equal(
                resolution.resolutionStatus,
                'owner_retained' satisfies RecipientResolutionStatus,
            );
            assert.equal(
                resolution.holderClassification.classificationStatus,
                'not_matched',
            );
            assert.equal(
                resolution.resolvedRecipient?.displayName,
                owner.displayName,
            );

            return {
                scenario: 'non_institutional_owner_retained',
                resolutionStatus: resolution.resolutionStatus,
                resolutionReason: resolution.resolutionReason,
                classificationStatus:
                    resolution.holderClassification.classificationStatus,
                recipientDisplayName: resolution.resolvedRecipient?.displayName ?? null,
                note: 'owner retained',
            };
        },
    },
    {
        name: 'finance_holder_with_lessee_substituted',
        note: 'A matched institutional finance holder yields a lessee substitution when a reliable lessee is available.',
        run: () => {
            const owner = normalizePartyIdentityV1({
                partyKind: 'organization',
                displayName: 'Volkswagen Bank GmbH',
                partitaIva: '12576830155',
            });
            const lessee = normalizePartyIdentityV1({
                partyKind: 'natural_person',
                displayName: 'Giulia Verdi',
                codiceFiscale: 'VRDGLI80A41H501X',
            });
            const resolution = resolveRecipientFromOwnershipV1({
                registeredOwner: owner,
                lesseeOrUser: lessee,
                registryEntries: DEFAULT_INSTITUTIONAL_HOLDER_REGISTRY_V1,
            });
            const composed = composePreparationInputV1({
                preparationEvaluationId: 'compose-recipient-001',
                preparedRecordId: 'compose-recipient-prepared-001',
                preparedKey: 'compose-recipient-key-001',
                startedAt: '2026-04-08T14:00:00Z',
                createdAt: '2026-04-08T14:00:01Z',
                aciContribution: toNormalizedAciContributionV1({
                    sourceRowKey: 'aci-recipient-001',
                    plate: 'AB123CD',
                    vehicleType: 'car',
                    dueMonth: 4,
                    dueYear: 2026,
                }),
                recipientResolution: resolution,
                linkedYapContribution: toNormalizedYapContributionV1({
                    sourceRowKey: 'yap-recipient-001',
                    plate: 'AB123CD',
                    email: 'giulia@example.com',
                }),
                yapLinkageResult: {
                    linkageStatus: 'linked',
                    linkageReason: 'exact_plate_match',
                    matchedCandidate: { sourceRowKey: 'yap-recipient-001' },
                    criteriaUsed: ['plate_exact'],
                    matchedCandidatesCount: 1,
                    supportFieldsUsed: [],
                    note: 'linked for recipient golden',
                },
                externalVerification: buildRevisionVerification('verified_current'),
            });
            const result = prepareReminderRecordV1(composed.preparationInput);

            assert.equal(
                resolution.resolutionStatus,
                'lessee_substituted' satisfies RecipientResolutionStatus,
            );
            assert.equal(
                resolution.holderClassification.matchedEntry?.kind,
                'bank_finance',
            );
            assert.equal(
                composed.preparationInput.partyIdentity?.displayName,
                lessee.displayName,
            );
            assert.equal(result.evaluation.preparationStatus, 'ready');
            assert.ok(
                result.evaluation.preparationReasons.includes(
                    'recipient_substituted_to_lessee',
                ),
            );

            return {
                scenario: 'finance_holder_with_lessee_substituted',
                resolutionStatus: resolution.resolutionStatus,
                classificationStatus:
                    resolution.holderClassification.classificationStatus,
                matchedBy: resolution.holderClassification.matchedBy ?? null,
                recipientDisplayName:
                    composed.preparationInput.partyIdentity?.displayName ?? null,
                finalStatus: result.evaluation.preparationStatus,
                finalReasons: result.evaluation.preparationReasons,
                note: 'lessee substituted',
            };
        },
    },
    {
        name: 'dealer_holder_without_lessee_review_required',
        note: 'A matched dealer without lessee or user stays unresolved and raises a preparatory review outcome.',
        run: () => {
            const owner = normalizePartyIdentityV1({
                partyKind: 'organization',
                displayName: 'Auto Centro Retail S.R.L.',
                partitaIva: '01234560987',
            });
            const resolution = resolveRecipientFromOwnershipV1({
                registeredOwner: owner,
                registryEntries: DEFAULT_INSTITUTIONAL_HOLDER_REGISTRY_V1,
            });
            const result = prepareReminderRecordV1(
                buildInput({
                    recipientResolution: resolution,
                    partyIdentity: resolution.registeredOwner,
                    revisionVerification: buildRevisionVerification('verified_current'),
                }),
            );

            assert.equal(
                resolution.resolutionStatus,
                'review_required' satisfies RecipientResolutionStatus,
            );
            assert.equal(
                result.evaluation.preparationStatus,
                'identity_mismatch_review_required',
            );
            assert.deepEqual(result.evaluation.preparationReasons, [
                'institutional_holder_without_lessee',
            ]);

            return {
                scenario: 'dealer_holder_without_lessee_review_required',
                resolutionStatus: resolution.resolutionStatus,
                resolutionReason: resolution.resolutionReason,
                matchedKind:
                    resolution.holderClassification.matchedEntry?.kind ?? null,
                finalStatus: result.evaluation.preparationStatus,
                finalReasons: result.evaluation.preparationReasons,
                note: 'dealer without lessee triggers review',
            };
        },
    },
    {
        name: 'ambiguous_group_match_review_required',
        note: 'An ambiguous institutional registry match must not force a substitution and stays in review.',
        run: () => {
            const owner = normalizePartyIdentityV1({
                partyKind: 'organization',
                displayName: 'Fleet Group Mobility',
                partitaIva: '00000000000',
            });
            const ambiguousRegistry = [
                {
                    entryId: 'ambiguous-001',
                    kind: 'rental_fleet' as const,
                    canonicalName: 'FLEET GROUP MOBILITY',
                    aliases: ['FLEET GROUP'],
                    isActive: true,
                },
                {
                    entryId: 'ambiguous-002',
                    kind: 'other_institutional' as const,
                    canonicalName: 'FLEET GROUP MOBILITY',
                    aliases: ['FLEET GROUP'],
                    isActive: true,
                },
            ];
            const classification = classifyInstitutionalHolderV1(
                owner,
                ambiguousRegistry,
            );
            const resolution = resolveRecipientFromOwnershipV1({
                registeredOwner: owner,
                registryEntries: ambiguousRegistry,
            });
            const result = prepareReminderRecordV1(
                buildInput({
                    recipientResolution: resolution,
                    partyIdentity: resolution.registeredOwner,
                    revisionVerification: buildRevisionVerification('verified_current'),
                }),
            );

            assert.equal(classification.classificationStatus, 'ambiguous');
            assert.equal(
                resolution.resolutionStatus,
                'review_required' satisfies RecipientResolutionStatus,
            );
            assert.deepEqual(result.evaluation.preparationReasons, [
                'institutional_holder_match_ambiguous',
            ]);

            return {
                scenario: 'ambiguous_group_match_review_required',
                classificationStatus: classification.classificationStatus,
                matchedBy: classification.matchedBy ?? null,
                ambiguousEntryCount: classification.ambiguousEntries?.length ?? 0,
                resolutionStatus: resolution.resolutionStatus,
                finalStatus: result.evaluation.preparationStatus,
                finalReasons: result.evaluation.preparationReasons,
                note: 'ambiguous institutional match stays in review',
            };
        },
    },
];

for (const scenario of composeGoldenScenarios) {
    const composed = composePreparationInputV1(scenario.input);
    const result = prepareReminderRecordV1(composed.preparationInput);

    assert.deepEqual(composed.usedContributions, scenario.expectedUsed);
    assert.deepEqual(composed.ignoredContributions, scenario.expectedIgnored);
    assert.equal(result.evaluation.preparationStatus, scenario.expectedStatus);

    console.log(
        JSON.stringify(
            {
                scenario: scenario.name,
                usedContributions: composed.usedContributions,
                ignoredContributions: composed.ignoredContributions,
                contributingSources: composed.preparationInput.sourceTrace.contributingRawRecords.map(
                    (record) => record.sourceSystem,
                ),
                contactWinnerSources: composed.preparationInput.sourceTrace.winningFieldSources
                    .filter((winner) => winner.field.startsWith('contact_'))
                    .map((winner) => ({
                        field: winner.field,
                        source: winner.winningSource,
                    })),
                internalRevisionFound: composed.preparationInput.internalRevisionFound,
                externalVerificationStatus:
                    composed.preparationInput.revisionVerification.verificationStatus,
                finalStatus: result.evaluation.preparationStatus,
                note: scenario.note,
            },
            null,
            2,
        ),
    );
}

for (const scenario of batchGoldenScenarios) {
    console.log(JSON.stringify(scenario.run(), null, 2));
}

for (const scenario of persistenceGoldenScenarios) {
    console.log(JSON.stringify(await scenario.run(), null, 2));
}

for (const scenario of localDriverGoldenScenarios) {
    console.log(JSON.stringify(await scenario.run(), null, 2));
}

for (const scenario of partyIdentityGoldenScenarios) {
    const partyIdentity = normalizePartyIdentityV1(scenario.input);

    assert.equal(partyIdentity.partyKind, scenario.expectedPartyKind);
    assert.equal(
        partyIdentity.taxIdentityStatus,
        scenario.expectedTaxIdentityStatus,
    );
    assert.deepEqual(
        partyIdentity.taxIdentityWarnings,
        scenario.expectedWarnings,
    );

    console.log(
        JSON.stringify(
            {
                scenario: scenario.name,
                partyKind: partyIdentity.partyKind,
                displayName: partyIdentity.displayName,
                codiceFiscale: partyIdentity.codiceFiscale ?? null,
                partitaIva: partyIdentity.partitaIva ?? null,
                taxIdentityStatus: partyIdentity.taxIdentityStatus,
                taxIdentityWarnings: partyIdentity.taxIdentityWarnings,
                traceSources: partyIdentity.sourceTrace.map(
                    (traceRef) => traceRef.sourceSystem,
                ),
                note: scenario.note,
            },
            null,
            2,
        ),
    );
}

for (const scenario of institutionalRecipientGoldenScenarios) {
    console.log(JSON.stringify(scenario.run(), null, 2));
}

for (const scenario of linkageGoldenScenarios) {
    const result = linkAciToYapV1(scenario.aciRow, scenario.yapRows);

    assert.equal(result.linkageStatus, scenario.expectedStatus);
    assert.equal(result.linkageReason, scenario.expectedReason);

    console.log(
        JSON.stringify(
            {
                scenario: scenario.name,
                status: result.linkageStatus,
                reason: result.linkageReason,
                criteriaUsed: result.criteriaUsed,
                supportFieldsUsed: result.supportFieldsUsed,
                matchedCandidatesCount: result.matchedCandidatesCount,
                matchedSourceRowKey: result.matchedCandidate?.sourceRowKey ?? null,
                note: scenario.note,
            },
            null,
            2,
        ),
    );
}

for (const scenario of intakeGoldenScenarios) {
    console.log(JSON.stringify(scenario.run(), null, 2));
}

for (const scenario of goldenScenarios) {
    const result = prepareReminderRecordV1(scenario.input);
    const actualPrecedenceRules = result.evaluation.sourceTrace.appliedPrecedences.map(
        (precedence) => precedence.rule,
    );
    const actualRevisionRule = result.evaluation.sourceTrace.appliedPrecedences.find(
        (precedence) => precedence.scope === 'revision_verification',
    )?.rule;

    assert.equal(result.evaluation.preparationStatus, scenario.expectedStatus);
    assert.deepEqual(result.evaluation.preparationReasons, scenario.expectedReasons);
    assert.deepEqual(result.evaluation.sourceTrace.finalStatusReasons, scenario.expectedReasons);
    assert.deepEqual(actualPrecedenceRules, [
        'aci_candidate_due_context_primary',
        'yap_contact_primary',
        scenario.expectedRevisionRule,
    ]);
    assert.equal(actualRevisionRule, scenario.expectedRevisionRule);
    assert.equal(
        Boolean(result.evaluation.sourceTrace.externalVerification),
        scenario.expectedExternalVerificationUsed,
    );

    if (
        scenario.expectedStatus === 'ready' ||
        scenario.expectedStatus === 'ready_with_contact_warning'
    ) {
        assert.ok(result.preparedRecord);
        assert.equal(result.evaluation.preparedRecordId, scenario.input.preparedRecordId);
        assert.equal(result.evaluation.preparedKey, scenario.input.preparedKey);
    } else {
        assert.equal(result.preparedRecord, null);
        assert.equal(result.evaluation.preparedRecordId, null);
        assert.equal(result.evaluation.preparedKey, null);
    }

    console.log(
        JSON.stringify(
            {
                scenario: scenario.name,
                status: result.evaluation.preparationStatus,
                reasons: result.evaluation.preparationReasons,
                precedenceRules: actualPrecedenceRules,
                externalVerificationUsed: Boolean(
                    result.evaluation.sourceTrace.externalVerification,
                ),
                note: scenario.note,
            },
            null,
            2,
        ),
    );
}

console.log(
    `Golden scenarios passed: institutional_recipient=${institutionalRecipientGoldenScenarios.length}, party_identity=${partyIdentityGoldenScenarios.length}, local_driver=${localDriverGoldenScenarios.length}, persistence=${persistenceGoldenScenarios.length}, batch=${batchGoldenScenarios.length}, compose=${composeGoldenScenarios.length}, linkage=${linkageGoldenScenarios.length}, intake=${intakeGoldenScenarios.length}, decision=${goldenScenarios.length}`,
);

function buildInput(
    overrides: Partial<PreparationInput> = {},
): PreparationInput {
    const base: PreparationInput = {
        preparationEvaluationId: 'eval-001',
        preparedRecordId: 'prepared-001',
        preparedKey: 'prepared-key-001',
        identityKey: 'identity-key-001',
        vehicleIdentity: {
            identityKey: 'identity-key-001',
            plate: 'AB123CD',
            vehicleType: 'car',
            dueMonth: 4,
            dueYear: 2026,
            normalizationTrace: [
                {
                    sourceSystem: 'aci_csv',
                    sourceBatchId: 'batch-aci-001',
                    sourceRowKey: 'aci-row-001',
                    note: 'plate and due context normalized from ACI',
                },
            ],
        },
        contactProfile: buildContactProfile(),
        revisionVerification: buildRevisionVerification('verified_current'),
        internalRevisionFound: false,
        identityMismatchDetected: false,
        sourceTrace: buildSourceTrace(false),
        ...baseTimestamps,
    };

    return {
        ...base,
        ...overrides,
    };
}

function buildContactProfile(
    overrides: {
        nameValue?: string | null;
        addressValue?: string | null;
        postalCodeValue?: string | null;
        cityValue?: string | null;
        emailValue?: string | null;
        phoneValue?: string | null;
        phoneQuality?: FieldQuality;
    } = {},
): ContactProfile {
    const pick = <T>(key: keyof typeof overrides, fallback: T): T | null => {
        return Object.prototype.hasOwnProperty.call(overrides, key)
            ? (overrides[key] as T | null)
            : fallback;
    };

    const nameValue = pick('nameValue', 'Mario Rossi');
    const addressValue = pick('addressValue', 'Via Roma 1');
    const postalCodeValue = pick('postalCodeValue', '00100');
    const cityValue = pick('cityValue', 'Roma');
    const emailValue = pick('emailValue', 'mario@example.com');
    const phoneValue = pick('phoneValue', '+393331112233');

    return {
        name: buildField(nameValue, 'yap_csv'),
        address: buildField(addressValue, 'yap_csv'),
        postalCode: buildField(postalCodeValue, 'yap_csv'),
        city: buildField(cityValue, 'yap_csv'),
        province: buildField('RM', 'yap_csv'),
        email: buildField(emailValue, 'yap_csv'),
        phone: buildField(
            phoneValue,
            'yap_csv',
            overrides.phoneQuality ?? 'enriched',
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
            name: 'normalized',
            address: 'normalized',
            postalCode: 'normalized',
            city: 'normalized',
            province: 'normalized',
            email: emailValue === null ? 'missing' : 'enriched',
            phone:
                phoneValue === null
                    ? 'missing'
                    : overrides.phoneQuality ?? 'enriched',
        },
        matchConfidence: 'strong',
    };
}

function buildRevisionVerification(
    verificationStatus: VerificationStatus,
    useExternalVerification = false,
): RevisionVerification {
    const verification: RevisionVerification = {
        verificationStatus,
        verificationTrace: useExternalVerification
            ? [
                  {
                      sourceSystem: 'external_verification_adapter',
                      sourceBatchId: 'batch-ev-001',
                      sourceRowKey: 'ev-row-001',
                      note: 'external verification consulted',
                  },
              ]
            : [],
    };

    if (
        verificationStatus === 'verified_current' ||
        verificationStatus === 'already_revised_elsewhere'
    ) {
        verification.lastRevisionDate = '2026-03-10';
    }

    if (useExternalVerification) {
        verification.verifiedAt = '2026-04-08T08:45:00Z';
        verification.verificationSource = 'external_verification_adapter';
        verification.verificationChannel = 'manual_portale';
    }

    return verification;
}

function buildSourceTrace(
    useExternalVerification: boolean,
    externalVerificationStatus: VerificationStatus = 'verified_current',
): SourceTraceV1 {
    const sourceTrace: SourceTraceV1 = {
        contributingRawRecords: [
            {
                sourceSystem: 'aci_csv',
                sourceBatchId: 'batch-aci-001',
                sourceRowKey: 'aci-row-001',
                role: 'candidate',
            },
            {
                sourceSystem: 'yap_csv',
                sourceBatchId: 'batch-yap-001',
                sourceRowKey: 'yap-row-001',
                role: 'contact_enrichment',
            },
            {
                sourceSystem: useExternalVerification
                    ? 'external_verification_adapter'
                    : 'echoes_read_model',
                sourceBatchId: useExternalVerification
                    ? 'batch-ev-001'
                    : 'batch-echoes-001',
                sourceRowKey: useExternalVerification ? 'ev-row-001' : 'echoes-row-001',
                role: useExternalVerification
                    ? 'external_verification_result'
                    : 'internal_revision_history',
            },
        ],
        winningFieldSources: [],
        appliedPrecedences: [],
        finalStatusReasons: [],
    };

    if (useExternalVerification) {
        sourceTrace.externalVerification = {
            sourceSystem: 'external_verification_adapter',
            verificationResultId: 'ev-result-001',
            verificationStatus: externalVerificationStatus,
            verificationChannel: 'manual_portale',
        };
    }

    return sourceTrace;
}

function buildField(
    value: string | null,
    source: 'aci_csv' | 'yap_csv',
    quality: FieldQuality = value === null ? 'missing' : 'normalized',
): ProvenancedField<string> {
    return {
        value,
        source: value === null ? 'none' : source,
        quality,
    };
}

function buildComposeInputWithLinkedYap(
    verificationStatus: VerificationStatus,
): ComposePreparationInputV1 {
    const input: ComposePreparationInputV1 = {
        preparationEvaluationId: `compose-${verificationStatus}`,
        preparedRecordId: `compose-prepared-${verificationStatus}`,
        preparedKey: `compose-key-${verificationStatus}`,
        startedAt: '2026-04-08T10:00:00Z',
        createdAt: '2026-04-08T10:00:01Z',
        aciContribution: toNormalizedAciContributionV1({
            sourceBatchId: `batch-aci-${verificationStatus}`,
            sourceRowKey: `aci-${verificationStatus}`,
            plate: 'AB123CD',
            vehicleType: 'car',
            dueMonth: 4,
            dueYear: 2026,
            ownerName: 'Mario Rossi',
            addressLine: 'Via Roma 1',
            postalCode: '00100',
            city: 'Roma',
            province: 'RM',
        }),
        yapLinkageResult: {
            linkageStatus: 'linked',
            linkageReason: 'exact_plate_and_vehicle_type_match',
            matchedCandidate: {
                sourceRowKey: `yap-${verificationStatus}`,
                plate: 'AB123CD',
                vehicleType: 'car',
                email: 'mario@example.com',
                phone: '+393331112233',
            },
            criteriaUsed: [
                'plate_exact',
                'vehicle_type_match',
                'email_support_present',
                'phone_support_present',
            ],
            matchedCandidatesCount: 1,
            supportFieldsUsed: ['vehicle_type', 'email', 'phone'],
            note: 'linked by exact plate and matching vehicle type',
        },
        linkedYapContribution: toNormalizedYapContributionV1({
            sourceBatchId: `batch-yap-${verificationStatus}`,
            sourceRowKey: `yap-${verificationStatus}`,
            plate: 'AB123CD',
            vehicleType: 'car',
            contactName: 'Mario Rossi',
            addressLine: 'Via Milano 2',
            postalCode: '20100',
            city: 'Milano',
            province: 'MI',
            email: 'mario@example.com',
            phone: '+393331112233',
        }),
    };

    if (
        verificationStatus === 'verified_current' ||
        verificationStatus === 'already_revised_elsewhere'
    ) {
        input.externalVerification = toRevisionVerificationFromExternalInputV1({
            sourceBatchId: `batch-ev-${verificationStatus}`,
            sourceRowKey: `ev-${verificationStatus}`,
            plate: 'AB123CD',
            vehicleType: 'car',
            verificationStatus,
            verificationChannel: 'manual_portale',
            verifiedAt: '2026-04-08T08:45:00Z',
            lastRevisionDate: '2026-03-10',
        });
    }

    return input;
}
