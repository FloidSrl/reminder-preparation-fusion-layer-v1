import type {
    PreparationEvaluationWriter,
    PreparedEvaluationWriteModelV1,
    PreparedRecordWriteModelV1,
    PreparedRecordWriter,
} from '../../application/persistBatchOutcomeV1.js';

export interface PostgresSqlExecutor {
    query(text: string, values: readonly unknown[]): Promise<unknown>;
}

export const INSERT_PREPARATION_EVALUATION_SQL = `
INSERT INTO preparation_evaluations (
    preparation_evaluation_id,
    identity_key,
    preparation_rule_version,
    evaluation_status,
    preparation_status,
    preparation_reasons,
    matching_trace,
    source_trace,
    started_at,
    completed_at
) VALUES (
    $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
)`;

export const INSERT_PREPARED_RECORD_SQL = `
INSERT INTO prepared_records (
    prepared_record_id,
    preparation_evaluation_id,
    prepared_key,
    identity_key,
    vehicle_identity,
    contact_profile,
    revision_verification,
    preparation_status,
    preparation_reasons,
    source_trace,
    preparation_rule_version,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11, $12, $13
)`;

export class PostgresPreparationEvaluationWriter
    implements PreparationEvaluationWriter
{
    constructor(private readonly executor: PostgresSqlExecutor) {}

    async writePreparationEvaluation(
        model: PreparedEvaluationWriteModelV1,
    ): Promise<void> {
        await this.executor.query(
            INSERT_PREPARATION_EVALUATION_SQL,
            buildPreparationEvaluationInsertValues(model),
        );
    }
}

export class PostgresPreparedRecordWriter implements PreparedRecordWriter {
    constructor(private readonly executor: PostgresSqlExecutor) {}

    async writePreparedRecord(
        model: PreparedRecordWriteModelV1,
    ): Promise<void> {
        await this.executor.query(
            INSERT_PREPARED_RECORD_SQL,
            buildPreparedRecordInsertValues(model),
        );
    }
}

export function buildPreparationEvaluationInsertValues(
    model: PreparedEvaluationWriteModelV1,
): readonly unknown[] {
    return [
        model.preparationEvaluationId,
        model.identityKey,
        model.preparationRuleVersion,
        model.evaluationStatus,
        model.preparationStatus,
        serializeJson(model.preparationReasons),
        serializeJson(model.matchingTrace),
        serializeJson(model.sourceTrace),
        model.startedAt,
        model.completedAt ?? null,
    ];
}

export function buildPreparedRecordInsertValues(
    model: PreparedRecordWriteModelV1,
): readonly unknown[] {
    return [
        model.preparedRecordId,
        model.preparationEvaluationId,
        model.preparedKey,
        model.identityKey,
        serializeJson(model.vehicleIdentity),
        serializeJson(model.contactProfile),
        serializeJson(model.revisionVerification),
        model.preparationStatus,
        serializeJson(model.preparationReasons),
        serializeJson(model.sourceTrace),
        model.preparationRuleVersion,
        model.createdAt,
        model.updatedAt,
    ];
}

function serializeJson(value: unknown): string {
    return JSON.stringify(value);
}
