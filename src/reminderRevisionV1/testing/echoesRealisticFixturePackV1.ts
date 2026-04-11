import type { EchoesReminderRevisionAdapterInputV1 } from '../adapters/echoes/types.js';
import type { ObservationInput } from '../domain/contracts.js';

export interface EchoesRealisticFixtureV1 {
    scenario_id: string;
    description: string;
    adapter_input: EchoesReminderRevisionAdapterInputV1;
}

const timestamps = {
    observed_at: '2026-04-11T10:00:00Z',
    ingested_at: '2026-04-11T10:00:05Z',
    created_at: '2026-04-11T10:01:00Z',
    generated_at: '2026-04-11T10:01:01Z',
};

export const echoesRealisticFixturePackV1: EchoesRealisticFixtureV1[] = [
    {
        scenario_id: 'echoes_realistic_ready_clean_revision_due',
        description:
            'revision_due_fact pulito con identita coerente e contributi esterni minimi completi',
        adapter_input: buildAdapterInput('ready-clean-001', {
            observations: [
                buildObservation('obs-ready-clean-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'AB123CD',
                    vehicle_type: 'car',
                }),
                buildObservation(
                    'obs-ready-clean-owner',
                    'registered_owner_fact',
                    'high',
                    {
                        subject_ref: 'owner-001',
                        display_name: 'Mario Rossi',
                    },
                ),
                buildObservation('obs-ready-clean-due', 'revision_due_fact', 'high', {
                    due_at: '2026-05-15',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_contributions: {
                recipient_candidates: [
                    {
                        candidate_id: 'owner-001',
                        role: 'registered_owner',
                        confidence: 'high',
                    },
                ],
                resolved_recipient: {
                    subject_ref: 'owner-001',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Roma 1',
                        city: 'Roma',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
                final_subject: {
                    subject_ref: 'owner-001',
                    display_name: 'Mario Rossi',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_extracted_due_with_mixed_addressing',
        description:
            'extracted_due_fact con addressing misto valido, warning atteso solo in Preparation',
        adapter_input: buildAdapterInput('mixed-addressing-001', {
            observations: [
                buildObservation('obs-mixed-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'CD456EF',
                    vehicle_type: 'car',
                }),
                buildObservation('obs-mixed-owner', 'registered_owner_fact', 'high', {
                    subject_ref: 'owner-002',
                    display_name: 'Giulia Bianchi',
                }),
                buildObservation('obs-mixed-due', 'extracted_due_fact', 'high', {
                    due_at: '2026-06-21',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_contributions: {
                recipient_candidates: [
                    {
                        candidate_id: 'owner-002',
                        role: 'registered_owner',
                        confidence: 'high',
                    },
                ],
                resolved_recipient: {
                    subject_ref: 'owner-002',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Milano 7',
                        city: 'Milano',
                    },
                    digital_address: {
                        email: 'giulia.bianchi@example.com',
                    },
                    addressing_basis: 'mixed',
                    confidence: 'medium',
                },
                final_subject: {
                    subject_ref: 'owner-002',
                    display_name: 'Giulia Bianchi',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_artifact_only_without_due_fact',
        description:
            'artifact_presence_signal con correlation_keys presenti ma senza fatto forte sul due',
        adapter_input: buildAdapterInput('artifact-only-001', {
            observations: [
                buildObservation(
                    'obs-artifact-only',
                    'artifact_presence_signal',
                    'medium',
                    {
                        artifact_kind: 'revision_document',
                        due_at: '2026-05-30',
                        due_basis: 'derived_rule',
                        due_precision: 'coarse',
                    },
                    {
                        vehicle_plate: 'EF789GH',
                        external_case_key: 'echoes-case-001',
                    },
                ),
                buildObservation('obs-artifact-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'EF789GH',
                    vehicle_type: 'car',
                }),
            ],
            external_contributions: {
                resolved_recipient: {
                    subject_ref: 'owner-003',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Napoli 9',
                        city: 'Napoli',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_duplicate_relation_requires_core_decision',
        description:
            'duplicate_relation_fact realistico che l adapter mappa in duplicate_state, lasciando la decisione finale al nucleo',
        adapter_input: buildAdapterInput('duplicate-001', {
            observations: [
                buildObservation('obs-dup-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'GH012IJ',
                    vehicle_type: 'car',
                }),
                buildObservation('obs-dup-owner', 'registered_owner_fact', 'high', {
                    subject_ref: 'owner-004',
                    display_name: 'Paolo Verdi',
                }),
                buildObservation('obs-dup-due', 'revision_due_fact', 'high', {
                    due_at: '2026-07-10',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
                buildObservation('obs-dup-relation', 'duplicate_relation_fact', 'high', {
                    duplicate_state: 'duplicate',
                    related_case_ref: 'echoes-case-dup-777',
                }),
            ],
            external_contributions: {
                recipient_candidates: [
                    {
                        candidate_id: 'owner-004',
                        role: 'registered_owner',
                        confidence: 'high',
                    },
                ],
                resolved_recipient: {
                    subject_ref: 'owner-004',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Torino 3',
                        city: 'Torino',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
                final_subject: {
                    subject_ref: 'owner-004',
                    display_name: 'Paolo Verdi',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_ignores_named_out_of_profile_fact_types',
        description:
            'fact type fuori profilo espliciti e nominati vengono ignorati senza fallback impliciti',
        adapter_input: buildAdapterInput('ignored-types-001', {
            observations: [
                buildObservation('obs-ignored-insurance', 'insurance_policy_fact', 'high', {
                    policy_number: 'POL-009',
                }),
                buildObservation('obs-ignored-payment', 'payment_status_fact', 'medium', {
                    payment_status: 'paid',
                }),
                buildObservation('obs-ignored-vehicle', 'insurance_policy_fact', 'high', {
                    policy_number: 'POL-010',
                }, {
                    vehicle_plate: 'ZZ999ZZ',
                }),
                buildObservation('obs-ignored-owner', 'registered_owner_fact', 'high', {
                    subject_ref: 'owner-005',
                    display_name: 'Lucia Neri',
                }),
                buildObservation('obs-ignored-due', 'revision_due_fact', 'high', {
                    due_at: '2026-08-04',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_contributions: {
                recipient_candidates: [
                    {
                        candidate_id: 'owner-005',
                        role: 'registered_owner',
                        confidence: 'high',
                    },
                ],
                resolved_recipient: {
                    subject_ref: 'owner-005',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Firenze 11',
                        city: 'Firenze',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_conflict_between_observation_and_external_due',
        description:
            'conflitto plausibile tra observation Echoes forti ed external contribution separata',
        adapter_input: buildAdapterInput('conflict-001', {
            observations: [
                buildObservation('obs-conflict-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'IJ345KL',
                    vehicle_type: 'car',
                }),
                buildObservation('obs-conflict-owner', 'registered_owner_fact', 'high', {
                    subject_ref: 'owner-006',
                    display_name: 'Sara Gialli',
                }),
                buildObservation('obs-conflict-due', 'extracted_due_fact', 'medium', {
                    due_at: '2026-09-12',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_contributions: {
                external_due_contributions: [
                    {
                        ref_id: 'ext-due-conflict-001',
                        due_candidate: {
                            fact_type: 'external_due_fact',
                            due_at: '2026-09-20',
                            due_basis: 'registry_document',
                            due_precision: 'exact_day',
                            confidence: 'medium',
                        },
                    },
                ],
                recipient_candidates: [
                    {
                        candidate_id: 'owner-006',
                        role: 'registered_owner',
                        confidence: 'high',
                    },
                ],
                resolved_recipient: {
                    subject_ref: 'owner-006',
                    recipient_role: 'registered_owner',
                    resolution_basis: 'owner_retained',
                    confidence: 'high',
                },
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Bologna 2',
                        city: 'Bologna',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
                final_subject: {
                    subject_ref: 'owner-006',
                    display_name: 'Sara Gialli',
                },
            },
        }),
    },
    {
        scenario_id: 'echoes_realistic_due_present_but_recipient_unresolved',
        description:
            'fatto forte sul due presente ma recipient non risolto, senza chiusura semantica nell adapter',
        adapter_input: buildAdapterInput('recipient-unresolved-001', {
            observations: [
                buildObservation('obs-unresolved-vehicle', 'vehicle_identity_fact', 'high', {
                    plate: 'LM678NO',
                    vehicle_type: 'car',
                }),
                buildObservation(
                    'obs-unresolved-owner',
                    'registered_owner_fact',
                    'high',
                    {
                        subject_ref: 'owner-007',
                        display_name: 'Davide Blu',
                    },
                ),
                buildObservation('obs-unresolved-due', 'revision_due_fact', 'high', {
                    due_at: '2026-10-05',
                    due_basis: 'extracted_fact',
                    due_precision: 'exact_day',
                }),
            ],
            external_contributions: {
                resolved_addressing: {
                    postal_address: {
                        line1: 'Via Genova 6',
                        city: 'Genova',
                    },
                    digital_address: null,
                    addressing_basis: 'direct',
                    confidence: 'high',
                },
            },
        }),
    },
];

function buildAdapterInput(
    suffix: string,
    overrides: Partial<EchoesReminderRevisionAdapterInputV1>,
): EchoesReminderRevisionAdapterInputV1 {
    return {
        preparation_evaluation_id: `eval|fixture-pack|${suffix}`,
        prepared_record_id: `prepared|fixture-pack|${suffix}`,
        source_contract_version: 'v1-doc-slice',
        created_at: timestamps.created_at,
        generated_at: timestamps.generated_at,
        observations: [],
        ...overrides,
    };
}

function buildObservation(
    observation_id: string,
    fact_type: string,
    confidence: ObservationInput['confidence'],
    fact_payload: Record<string, unknown>,
    correlation_keys: ObservationInput['correlation_keys'] = {},
): ObservationInput {
    return {
        observation_id,
        source_system: 'echoes',
        source_adapter: 'echoes_edge_rev',
        source_domain: 'reminder_revision_v1',
        observed_at: timestamps.observed_at,
        ingested_at: timestamps.ingested_at,
        asset_ref: `asset|${observation_id}`,
        fact_type,
        fact_payload,
        confidence,
        correlation_keys,
        lineage_anchors: {
            source_batch_id: 'batch-echoes-realistic-001',
            source_row_key: observation_id,
        },
    };
}
