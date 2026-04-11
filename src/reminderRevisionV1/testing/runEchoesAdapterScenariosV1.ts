import assert from 'node:assert/strict';

import { mapEchoesToReminderRevisionCaseV1 } from '../adapters/echoes/mapEchoesToReminderRevisionCaseV1.js';
import {
    classifyEchoesReminderRevisionFactTypeV1,
    type EchoesReminderRevisionAdapterInputV1,
} from '../adapters/echoes/types.js';
import { prepareReminderRevisionCaseV1 } from '../application/prepareReminderRevisionCaseV1.js';
import type { ObservationInput } from '../domain/contracts.js';

const timestamps = {
    observed_at: '2026-04-11T10:00:00Z',
    ingested_at: '2026-04-11T10:00:05Z',
    created_at: '2026-04-11T10:01:00Z',
    generated_at: '2026-04-11T10:01:01Z',
};

{
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('revision_due_fact'),
        'required',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('extracted_due_fact'),
        'required',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('vehicle_identity_fact'),
        'conditionally_useful',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('registered_owner_fact'),
        'conditionally_useful',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('duplicate_relation_fact'),
        'conditionally_useful',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('artifact_presence_signal'),
        'weak_signal_only',
    );
    assert.equal(
        classifyEchoesReminderRevisionFactTypeV1('insurance_policy_fact'),
        'ignored',
    );

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_declares_minimal_fact_profile',
                required: ['revision_due_fact', 'extracted_due_fact'],
                conditionally_useful: [
                    'vehicle_identity_fact',
                    'registered_owner_fact',
                    'duplicate_relation_fact',
                ],
                weak_signal_only: ['artifact_presence_signal'],
                ignored_example: 'insurance_policy_fact',
            },
            null,
            2,
        ),
    );
}

{
    const adapterInput = buildAdapterInput({
        observations: [
            buildObservation('obs-owner-001', 'registered_owner_fact', 'high', {
                subject_ref: 'owner-001',
                display_name: 'Mario Rossi',
            }),
            buildObservation('obs-due-001', 'revision_due_fact', 'high', {
                due_at: '2026-05-15',
                due_basis: 'extracted_fact',
                due_precision: 'exact_day',
            }),
        ],
    });

    const mappedCase = mapEchoesToReminderRevisionCaseV1(adapterInput);
    const result = prepareReminderRevisionCaseV1(mappedCase);

    assert.equal(mappedCase.registered_owner?.subject_ref, 'owner-001');
    assert.equal(mappedCase.recipient_candidates.length, 1);
    assert.equal(mappedCase.resolved_recipient, null);
    assert.equal(result.preparedRecord.readiness_status, 'blocked');
    assert.deepEqual(result.preparedRecord.blocking_reasons, ['recipient_unresolved']);
    assert.equal(result.communicationIntent, undefined);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_keeps_recipient_unresolved_until_preparation',
                mapped_registered_owner: mappedCase.registered_owner,
                mapped_recipient_candidates: mappedCase.recipient_candidates,
                mapped_resolved_recipient: mappedCase.resolved_recipient,
                final_readiness_status: result.preparedRecord.readiness_status,
                final_blocking_reasons: result.preparedRecord.blocking_reasons,
            },
            null,
            2,
        ),
    );
}

{
    const adapterInput = buildAdapterInput({
        observations: [
            buildObservation('obs-artifact-001', 'artifact_presence_signal', 'medium', {
                due_at: '2026-05-20',
                due_basis: 'derived_rule',
                due_precision: 'coarse',
            }),
            buildObservation('obs-vehicle-001', 'vehicle_identity_fact', 'high', {
                plate: 'AB123CD',
                vehicle_type: 'car',
            }),
        ],
        external_contributions: {
            resolved_recipient: {
                subject_ref: 'owner-001',
                recipient_role: 'registered_owner',
                resolution_basis: 'owner_retained',
                confidence: 'high',
            },
            resolved_addressing: {
                postal_address: { line1: 'Via Roma 1', city: 'Roma' },
                digital_address: null,
                addressing_basis: 'direct',
                confidence: 'high',
            },
        },
    });

    const mappedCase = mapEchoesToReminderRevisionCaseV1(adapterInput);
    const result = prepareReminderRevisionCaseV1(mappedCase);

    assert.equal(mappedCase.observations[0]?.fact_type, 'artifact_presence_signal');
    assert.equal(mappedCase.observations.length, 2);
    assert.equal(result.preparedRecord.readiness_status, 'not_ready');
    assert.equal(result.preparedRecord.projected_due_at, null);
    assert.equal(result.preparedRecord.revision_context.due_context.due_at, null);
    assert.equal(result.communicationIntent, undefined);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_keeps_artifact_signal_weak',
                first_fact_type: mappedCase.observations[0]?.fact_type ?? null,
                final_readiness_status: result.preparedRecord.readiness_status,
                final_due_context: result.preparedRecord.revision_context.due_context,
                emits_communication_intent: result.communicationIntent !== undefined,
            },
            null,
            2,
        ),
    );
}

{
    const adapterInput = buildAdapterInput({
        observations: [
            buildObservation('obs-ignored-001', 'insurance_policy_fact', 'high', {
                policy_number: 'POL-001',
            }),
            buildObservation('obs-owner-ignored-001', 'registered_owner_fact', 'high', {
                subject_ref: 'owner-ignored-001',
                display_name: 'Ignored Fallback',
            }),
        ],
    });

    const mappedCase = mapEchoesToReminderRevisionCaseV1(adapterInput);

    assert.deepEqual(
        mappedCase.observations.map((observation) => observation.fact_type),
        ['registered_owner_fact'],
    );
    assert.equal(mappedCase.vehicle_identity.plate, null);
    assert.equal(mappedCase.vehicle_identity.vehicle_type, null);
    assert.equal(mappedCase.recipient_candidates.length, 1);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_ignores_out_of_slice_fact_types',
                kept_fact_types: mappedCase.observations.map(
                    (observation) => observation.fact_type,
                ),
                mapped_vehicle_identity: mappedCase.vehicle_identity,
            },
            null,
            2,
        ),
    );
}

{
    const adapterInput = buildAdapterInput({
        observations: [
            buildObservation(
                'obs-foreign-vehicle-001',
                'insurance_policy_fact',
                'high',
                {
                    policy_number: 'POL-XYZ',
                },
                {
                    vehicle_plate: 'ZZ999ZZ',
                },
            ),
        ],
    });

    const mappedCase = mapEchoesToReminderRevisionCaseV1(adapterInput);

    assert.equal(mappedCase.observations.length, 0);
    assert.equal(mappedCase.vehicle_identity.plate, null);
    assert.equal(mappedCase.vehicle_identity.vehicle_type, null);

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_disallows_semantic_fallback_from_non_allowed_observations',
                kept_observations: mappedCase.observations.length,
                mapped_vehicle_identity: mappedCase.vehicle_identity,
            },
            null,
            2,
        ),
    );
}

{
    const adapterInput = buildAdapterInput({
        observations: [
            buildObservation('obs-vehicle-002', 'vehicle_identity_fact', 'high', {
                plate: 'AB123CD',
                vehicle_type: 'car',
            }),
            buildObservation('obs-owner-002', 'registered_owner_fact', 'high', {
                subject_ref: 'owner-001',
                display_name: 'Mario Rossi',
            }),
            buildObservation('obs-due-002', 'revision_due_fact', 'high', {
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
                postal_address: { line1: 'Via Roma 1', city: 'Roma' },
                digital_address: { email: 'mario@example.com' },
                addressing_basis: 'mixed',
                confidence: 'medium',
            },
            final_subject: {
                subject_ref: 'owner-001',
                display_name: 'Mario Rossi',
            },
            policy_flags: {
                requires_postal_fallback: true,
            },
        },
    });

    const mappedCase = mapEchoesToReminderRevisionCaseV1(adapterInput);
    const result = prepareReminderRevisionCaseV1(mappedCase);

    assert.equal(mappedCase.resolved_recipient?.subject_ref, 'owner-001');
    assert.equal(result.preparedRecord.readiness_status, 'ready_with_warnings');
    assert.equal(result.communicationIntent?.recipient.subject_ref, 'owner-001');
    assert.equal(
        result.communicationIntent?.policy_flags?.requires_postal_fallback,
        true,
    );

    console.log(
        JSON.stringify(
            {
                scenario_id: 'adapter_maps_to_preparation_port_with_structured_contributions',
                mapped_vehicle_identity: mappedCase.vehicle_identity,
                mapped_registered_owner: mappedCase.registered_owner,
                final_readiness_status: result.preparedRecord.readiness_status,
                final_warnings: result.preparedRecord.warnings,
                emits_communication_intent: result.communicationIntent !== undefined,
            },
            null,
            2,
        ),
    );
}

console.log('Echoes adapter scenarios passed: 6');

function buildAdapterInput(
    overrides: Partial<EchoesReminderRevisionAdapterInputV1>,
): EchoesReminderRevisionAdapterInputV1 {
    return {
        preparation_evaluation_id: 'eval|adapter-base',
        prepared_record_id: 'prepared|adapter-base',
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
    correlation_keys: ObservationInput['correlation_keys'] = {
        vehicle_plate: 'AB123CD',
    },
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
            source_batch_id: 'batch-echoes-001',
            source_row_key: observation_id,
        },
    };
}
