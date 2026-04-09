import { readFile } from 'node:fs/promises';

import type { PreparationStatus } from '../domain/model.js';
import type {
    ExternalVerificationInputV1,
} from '../input/intakeV1.js';
import {
    loadAciCsvRowsDetailedFromFileV1,
    loadYapCsvRowsDetailedFromFileV1,
    LocalDriverFileParseErrorV1,
    type CsvRowIssueV1,
} from '../input/localCsvDriverV1.js';
import {
    persistBatchOutcomeV1,
    type PersistBatchOutcomeMode,
    type PersistBatchOutcomeV1Result,
    type PreparationEvaluationWriter,
    type PreparedRecordWriter,
} from './persistBatchOutcomeV1.js';
import {
    runPreparationBatchV1,
    type RunPreparationBatchV1Result,
} from './runPreparationBatchV1.js';
import type { EchoesRevisionStateInputV1 } from './composePreparationInputV1.js';

export interface LocalDriverMocksV1 {
    echoesStateByAciSourceRowKey?: Record<string, EchoesRevisionStateInputV1>;
    externalVerificationByAciSourceRowKey?: Record<
        string,
        ExternalVerificationInputV1
    >;
}

export interface RunLocalPreparationDriverV1Input {
    aciCsvPath: string;
    yapCsvPath: string;
    mode: PersistBatchOutcomeMode;
    startedAt: string;
    createdAt: string;
    batchRunId: string;
    mocksFilePath?: string;
    preparationRuleVersion?: string;
    evaluationWriter?: PreparationEvaluationWriter;
    preparedRecordWriter?: PreparedRecordWriter;
}

export interface RunLocalPreparationDriverV1Result {
    batchResult: RunPreparationBatchV1Result;
    persistResult: PersistBatchOutcomeV1Result;
    inputDiagnostics: {
        aciAcceptedHeaders: string[];
        yapAcceptedHeaders: string[];
        aciHeaderMapping: Record<string, string>;
        yapHeaderMapping: Record<string, string>;
        aciSkippedRowCount: number;
        yapSkippedRowCount: number;
        rowIssues: CsvRowIssueV1[];
    };
    summary: {
        aciInputRowCount: number;
        yapInputRowCount: number;
        rowProcessedCount: number;
        rowSkippedCount: number;
        processedCount: number;
        preparedCount: number;
        statusCounts: Record<PreparationStatus, number>;
        recordsNeedingAttention: string[];
        recordsExcluded: string[];
        dryRunPayloadCount: number;
        appliedPayloadCount: number;
        rowErrorCount: number;
    };
}

export async function runLocalPreparationDriverV1(
    input: RunLocalPreparationDriverV1Input,
): Promise<RunLocalPreparationDriverV1Result> {
    const [aciLoadResult, yapLoadResult, mocks] = await Promise.all([
        loadAciCsvRowsDetailedFromFileV1(input.aciCsvPath),
        loadYapCsvRowsDetailedFromFileV1(input.yapCsvPath),
        loadLocalDriverMocksV1(input.mocksFilePath),
    ]);

    const batchResult = runPreparationBatchV1({
        batchRunId: input.batchRunId,
        startedAt: input.startedAt,
        createdAt: input.createdAt,
        aciRows: aciLoadResult.rows,
        yapRows: yapLoadResult.rows,
        getEchoesState: ({ aciRow }) =>
            mocks.echoesStateByAciSourceRowKey?.[aciRow.sourceRowKey],
        getExternalVerificationInput: ({ aciRow }) =>
            mocks.externalVerificationByAciSourceRowKey?.[aciRow.sourceRowKey],
    });

    const inMemoryApplyWriters =
        input.mode === 'apply' &&
        (!input.evaluationWriter || !input.preparedRecordWriter)
            ? {
                  evaluationWriter: {
                      writePreparationEvaluation() {
                          return undefined;
                      },
                  } satisfies PreparationEvaluationWriter,
                  preparedRecordWriter: {
                      writePreparedRecord() {
                          return undefined;
                      },
                  } satisfies PreparedRecordWriter,
              }
            : null;

    const persistResult = await persistBatchOutcomeV1({
        mode: input.mode,
        batchResult,
        ...(input.preparationRuleVersion
            ? { preparationRuleVersion: input.preparationRuleVersion }
            : {}),
        ...(input.evaluationWriter
            ? { evaluationWriter: input.evaluationWriter }
            : {}),
        ...(input.preparedRecordWriter
            ? { preparedRecordWriter: input.preparedRecordWriter }
            : {}),
        ...(inMemoryApplyWriters && !input.evaluationWriter
            ? { evaluationWriter: inMemoryApplyWriters.evaluationWriter }
            : {}),
        ...(inMemoryApplyWriters && !input.preparedRecordWriter
            ? { preparedRecordWriter: inMemoryApplyWriters.preparedRecordWriter }
            : {}),
    });

    return {
        batchResult,
        persistResult,
        inputDiagnostics: {
            aciAcceptedHeaders: [...aciLoadResult.acceptedHeaders],
            yapAcceptedHeaders: [...yapLoadResult.acceptedHeaders],
            aciHeaderMapping: { ...aciLoadResult.headerMapping },
            yapHeaderMapping: { ...yapLoadResult.headerMapping },
            aciSkippedRowCount: aciLoadResult.skippedRowCount,
            yapSkippedRowCount: yapLoadResult.skippedRowCount,
            rowIssues: [
                ...aciLoadResult.rowIssues,
                ...yapLoadResult.rowIssues,
            ],
        },
        summary: {
            aciInputRowCount:
                aciLoadResult.rows.length + aciLoadResult.skippedRowCount,
            yapInputRowCount:
                yapLoadResult.rows.length + yapLoadResult.skippedRowCount,
            rowProcessedCount: aciLoadResult.rows.length,
            rowSkippedCount:
                aciLoadResult.skippedRowCount + yapLoadResult.skippedRowCount,
            processedCount: batchResult.processedCount,
            preparedCount: batchResult.preparedCount,
            statusCounts: { ...batchResult.statusCounts },
            recordsNeedingAttention: batchResult.recordOutcomes
                .filter((outcome) =>
                    [
                        'needs_external_verification',
                        'identity_mismatch_review_required',
                        'insufficient_contact_data',
                    ].includes(outcome.evaluation.preparationStatus),
                )
                .map((outcome) => outcome.aciSourceRowKey),
            recordsExcluded: batchResult.recordOutcomes
                .filter(
                    (outcome) =>
                        outcome.evaluation.preparationStatus ===
                            'excluded_internal_revision_found' ||
                        outcome.evaluation.preparationStatus ===
                            'already_revised_elsewhere',
                )
                .map((outcome) => outcome.aciSourceRowKey),
            dryRunPayloadCount:
                input.mode === 'dry_run'
                    ? persistResult.evaluationCount +
                      persistResult.preparedRecordCount
                    : 0,
            appliedPayloadCount:
                input.mode === 'apply'
                    ? persistResult.appliedEvaluationCount +
                      persistResult.appliedPreparedRecordCount
                    : 0,
            rowErrorCount:
                aciLoadResult.rowIssues.length + yapLoadResult.rowIssues.length,
        },
    };
}

async function loadLocalDriverMocksV1(
    filePath?: string,
): Promise<LocalDriverMocksV1> {
    if (!filePath) {
        return {};
    }

    const fileContents = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(fileContents) as LocalDriverMocksV1;

    return {
        ...(parsed.echoesStateByAciSourceRowKey
            ? {
                  echoesStateByAciSourceRowKey:
                      parsed.echoesStateByAciSourceRowKey,
              }
            : {}),
        ...(parsed.externalVerificationByAciSourceRowKey
            ? {
                  externalVerificationByAciSourceRowKey:
                      parsed.externalVerificationByAciSourceRowKey,
              }
            : {}),
    };
}

export function isLocalDriverFileParseErrorV1(
    error: unknown,
): error is LocalDriverFileParseErrorV1 {
    return (
        error instanceof Error &&
        error.name === 'LocalDriverFileParseErrorV1'
    );
}
