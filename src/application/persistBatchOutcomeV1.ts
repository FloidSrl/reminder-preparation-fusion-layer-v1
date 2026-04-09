import type {
    PreparationEvaluationV1,
    PreparationStatus,
    ReminderPreparedRecordV1,
    SourceTraceV1,
} from '../domain/model.js';
import type {
    BatchRecordOutcomeV1,
    RunPreparationBatchV1Result,
} from './runPreparationBatchV1.js';

export type PersistBatchOutcomeMode = 'dry_run' | 'apply';

export interface PreparedEvaluationWriteModelV1 {
    preparationEvaluationId: string;
    identityKey: string;
    preparationRuleVersion: string;
    evaluationStatus: PreparationEvaluationV1['evaluationStatus'];
    preparationStatus: PreparationEvaluationV1['preparationStatus'];
    preparationReasons: PreparationEvaluationV1['preparationReasons'];
    matchingTrace: {
        aciSourceRowKey: string;
        aciSourceBatchId?: string;
        linkageResult: BatchRecordOutcomeV1['linkageResult'];
        usedContributions: string[];
        ignoredContributions: string[];
        diagnosticNote: string;
    };
    sourceTrace: SourceTraceV1;
    startedAt: string;
    completedAt?: string;
}

export interface PreparedRecordWriteModelV1 {
    preparedRecordId: string;
    preparationEvaluationId: string;
    preparedKey: string;
    identityKey: string;
    vehicleIdentity: ReminderPreparedRecordV1['vehicleIdentity'];
    contactProfile: ReminderPreparedRecordV1['contactProfile'];
    revisionVerification: ReminderPreparedRecordV1['revisionVerification'];
    preparationStatus: ReminderPreparedRecordV1['preparationStatus'];
    preparationReasons: ReminderPreparedRecordV1['preparationReasons'];
    sourceTrace: ReminderPreparedRecordV1['sourceTrace'];
    preparationRuleVersion: string;
    createdAt: string;
    updatedAt: string;
}

export interface PreparationEvaluationWriter {
    writePreparationEvaluation(
        model: PreparedEvaluationWriteModelV1,
    ): void | Promise<void>;
}

export interface PreparedRecordWriter {
    writePreparedRecord(
        model: PreparedRecordWriteModelV1,
    ): void | Promise<void>;
}

export interface PersistBatchOutcomeV1Input {
    mode: PersistBatchOutcomeMode;
    batchResult: RunPreparationBatchV1Result;
    preparationRuleVersion?: string;
    evaluationWriter?: PreparationEvaluationWriter;
    preparedRecordWriter?: PreparedRecordWriter;
}

export interface PersistBatchOutcomeV1Result {
    mode: PersistBatchOutcomeMode;
    preparationRuleVersion: string;
    evaluationCount: number;
    preparedRecordCount: number;
    statusCounts: Record<PreparationStatus, number>;
    evaluationWrites: PreparedEvaluationWriteModelV1[];
    preparedRecordWrites: PreparedRecordWriteModelV1[];
    appliedEvaluationCount: number;
    appliedPreparedRecordCount: number;
}

export const DEFAULT_PREPARATION_RULE_VERSION = 'fusion-layer-v1';

export async function persistBatchOutcomeV1(
    input: PersistBatchOutcomeV1Input,
): Promise<PersistBatchOutcomeV1Result> {
    const preparationRuleVersion =
        input.preparationRuleVersion ?? DEFAULT_PREPARATION_RULE_VERSION;
    const evaluationWrites = input.batchResult.recordOutcomes.map((outcome) =>
        buildPreparedEvaluationWriteModelV1(outcome, preparationRuleVersion),
    );
    const preparedRecordWrites = input.batchResult.recordOutcomes
        .flatMap((outcome) =>
            outcome.preparedRecord
                ? [
                      buildPreparedRecordWriteModelV1(
                          outcome.preparedRecord,
                          preparationRuleVersion,
                      ),
                  ]
                : [],
        );

    if (input.mode === 'apply') {
        if (!input.evaluationWriter) {
            throw new Error(
                'evaluationWriter is required when persistBatchOutcomeV1 runs in apply mode',
            );
        }

        if (preparedRecordWrites.length > 0 && !input.preparedRecordWriter) {
            throw new Error(
                'preparedRecordWriter is required when apply mode includes prepared record writes',
            );
        }

        for (const evaluationWrite of evaluationWrites) {
            await input.evaluationWriter.writePreparationEvaluation(
                evaluationWrite,
            );
        }

        for (const preparedRecordWrite of preparedRecordWrites) {
            await input.preparedRecordWriter?.writePreparedRecord(
                preparedRecordWrite,
            );
        }
    }

    return {
        mode: input.mode,
        preparationRuleVersion,
        evaluationCount: evaluationWrites.length,
        preparedRecordCount: preparedRecordWrites.length,
        statusCounts: { ...input.batchResult.statusCounts },
        evaluationWrites,
        preparedRecordWrites,
        appliedEvaluationCount: input.mode === 'apply' ? evaluationWrites.length : 0,
        appliedPreparedRecordCount:
            input.mode === 'apply' ? preparedRecordWrites.length : 0,
    };
}

function buildPreparedEvaluationWriteModelV1(
    outcome: BatchRecordOutcomeV1,
    preparationRuleVersion: string,
): PreparedEvaluationWriteModelV1 {
    return {
        preparationEvaluationId: outcome.evaluation.preparationEvaluationId,
        identityKey: outcome.evaluation.identityKey,
        preparationRuleVersion,
        evaluationStatus: outcome.evaluation.evaluationStatus,
        preparationStatus: outcome.evaluation.preparationStatus,
        preparationReasons: [...outcome.evaluation.preparationReasons],
        matchingTrace: {
            aciSourceRowKey: outcome.aciSourceRowKey,
            ...(outcome.aciSourceBatchId
                ? { aciSourceBatchId: outcome.aciSourceBatchId }
                : {}),
            linkageResult: outcome.linkageResult,
            usedContributions: [...outcome.usedContributions],
            ignoredContributions: [...outcome.ignoredContributions],
            diagnosticNote: outcome.diagnosticNote,
        },
        sourceTrace: cloneSourceTrace(outcome.evaluation.sourceTrace),
        startedAt: outcome.evaluation.startedAt,
        ...(outcome.evaluation.completedAt
            ? { completedAt: outcome.evaluation.completedAt }
            : {}),
    };
}

function buildPreparedRecordWriteModelV1(
    preparedRecord: ReminderPreparedRecordV1,
    preparationRuleVersion: string,
): PreparedRecordWriteModelV1 {
    return {
        preparedRecordId: preparedRecord.preparedRecordId,
        preparationEvaluationId: preparedRecord.preparationEvaluationId,
        preparedKey: preparedRecord.preparedKey,
        identityKey: preparedRecord.identityKey,
        vehicleIdentity: structuredClone(preparedRecord.vehicleIdentity),
        contactProfile: structuredClone(preparedRecord.contactProfile),
        revisionVerification: structuredClone(preparedRecord.revisionVerification),
        preparationStatus: preparedRecord.preparationStatus,
        preparationReasons: [...preparedRecord.preparationReasons],
        sourceTrace: cloneSourceTrace(preparedRecord.sourceTrace),
        preparationRuleVersion,
        createdAt: preparedRecord.createdAt,
        updatedAt: preparedRecord.createdAt,
    };
}

function cloneSourceTrace(sourceTrace: SourceTraceV1): SourceTraceV1 {
    return structuredClone(sourceTrace);
}
