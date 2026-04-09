import type {
    LinkageResultV1,
    PreparationResultV1,
    PreparationStatus,
    RecipientResolutionResultV1,
} from '../domain/model.js';
import {
    toNormalizedAciContributionV1,
    toNormalizedYapContributionV1,
    toRevisionVerificationFromExternalInputV1,
    type AciCsvRowV1,
    type ExternalVerificationInputV1,
    type NormalizedAciContributionV1,
    type NormalizedYapContributionV1,
    type YapCsvRowV1,
} from '../input/intakeV1.js';
import { linkAciToYapV1 } from '../input/linkageV1.js';
import { buildPreparedIdentifiersV1 } from './buildPreparedIdentifiersV1.js';
import {
    composePreparationInputV1,
    type ComposePreparationResultV1,
    type EchoesRevisionStateInputV1,
} from './composePreparationInputV1.js';
import { prepareReminderRecordV1 } from './prepareReminderRecord.js';

export interface BatchRecordOutcomeV1 {
    aciSourceRowKey: string;
    aciSourceBatchId?: string;
    identityKey: string;
    linkageResult: LinkageResultV1<YapCsvRowV1>;
    usedContributions: string[];
    ignoredContributions: string[];
    evaluation: PreparationResultV1['evaluation'];
    preparedRecord: PreparationResultV1['preparedRecord'];
    diagnosticNote: string;
}

export interface RunPreparationBatchV1Input {
    batchRunId: string;
    startedAt: string;
    createdAt: string;
    aciRows: AciCsvRowV1[];
    yapRows: YapCsvRowV1[];
    getEchoesState?: (context: {
        aciRow: AciCsvRowV1;
        aciContribution: NormalizedAciContributionV1;
    }) => EchoesRevisionStateInputV1 | undefined;
    getExternalVerificationInput?: (context: {
        aciRow: AciCsvRowV1;
        aciContribution: NormalizedAciContributionV1;
        linkageResult: LinkageResultV1<YapCsvRowV1>;
        linkedYapRow: YapCsvRowV1 | null;
        linkedYapContribution: NormalizedYapContributionV1 | null;
    }) => ExternalVerificationInputV1 | undefined;
    getRecipientResolution?: (context: {
        aciRow: AciCsvRowV1;
        aciContribution: NormalizedAciContributionV1;
        linkageResult: LinkageResultV1<YapCsvRowV1>;
        linkedYapRow: YapCsvRowV1 | null;
        linkedYapContribution: NormalizedYapContributionV1 | null;
    }) => RecipientResolutionResultV1 | undefined;
}

export interface RunPreparationBatchV1Result {
    processedCount: number;
    preparedCount: number;
    statusCounts: Record<PreparationStatus, number>;
    recordOutcomes: BatchRecordOutcomeV1[];
}

export function runPreparationBatchV1(
    input: RunPreparationBatchV1Input,
): RunPreparationBatchV1Result {
    const recordOutcomes = input.aciRows.map((aciRow) =>
        processAciRow(input, aciRow),
    );

    const statusCounts = buildEmptyStatusCounts();

    for (const outcome of recordOutcomes) {
        statusCounts[outcome.evaluation.preparationStatus] += 1;
    }

    return {
        processedCount: recordOutcomes.length,
        preparedCount: recordOutcomes.filter(
            (outcome) => outcome.preparedRecord !== null,
        ).length,
        statusCounts,
        recordOutcomes,
    };
}

function processAciRow(
    batchInput: RunPreparationBatchV1Input,
    aciRow: AciCsvRowV1,
): BatchRecordOutcomeV1 {
    const aciContribution = toNormalizedAciContributionV1(aciRow);
    const linkageResult = linkAciToYapV1(aciRow, batchInput.yapRows);
    const linkedYapRow = linkageResult.linkageStatus === 'linked'
        ? linkageResult.matchedCandidate
        : null;
    const linkedYapContribution = linkedYapRow
        ? toNormalizedYapContributionV1(linkedYapRow)
        : null;
    const echoesState = batchInput.getEchoesState?.({
        aciRow,
        aciContribution,
    });
    const externalVerificationInput =
        batchInput.getExternalVerificationInput?.({
            aciRow,
            aciContribution,
            linkageResult,
            linkedYapRow,
            linkedYapContribution,
        });
    const recipientResolution =
        batchInput.getRecipientResolution?.({
            aciRow,
            aciContribution,
            linkageResult,
            linkedYapRow,
            linkedYapContribution,
        });

    const preparedIdentifiers = buildPreparedIdentifiersV1({
        batchRunId: batchInput.batchRunId,
        aciSourceRowKey: aciRow.sourceRowKey,
        aciContribution,
        linkedYapContribution,
        ...(externalVerificationInput
            ? { externalVerificationInput }
            : {}),
        ...(echoesState ? { echoesState } : {}),
    });

    const composeResult = composePreparationInputV1({
        preparationEvaluationId: buildPreparationEvaluationId(
            batchInput.batchRunId,
            aciRow,
        ),
        preparedRecordId: preparedIdentifiers.preparedRecordId,
        preparedKey: preparedIdentifiers.preparedKey,
        startedAt: batchInput.startedAt,
        createdAt: batchInput.createdAt,
        aciContribution,
        ...(recipientResolution ? { recipientResolution } : {}),
        yapLinkageResult: linkageResult,
        ...(linkedYapContribution
            ? { linkedYapContribution }
            : {}),
        ...(echoesState ? { echoesState } : {}),
        ...(externalVerificationInput
            ? {
                  externalVerification:
                      toRevisionVerificationFromExternalInputV1(
                          externalVerificationInput,
                      ),
              }
            : {}),
    });

    const preparationResult = prepareReminderRecordV1(
        composeResult.preparationInput,
    );

    return buildBatchRecordOutcome(
        aciRow,
        aciContribution,
        linkageResult,
        composeResult,
        preparationResult,
    );
}

function buildBatchRecordOutcome(
    aciRow: AciCsvRowV1,
    aciContribution: NormalizedAciContributionV1,
    linkageResult: LinkageResultV1<YapCsvRowV1>,
    composeResult: ComposePreparationResultV1,
    preparationResult: PreparationResultV1,
): BatchRecordOutcomeV1 {
    return {
        aciSourceRowKey: aciRow.sourceRowKey,
        ...(aciRow.sourceBatchId ? { aciSourceBatchId: aciRow.sourceBatchId } : {}),
        identityKey: aciContribution.vehicleIdentity.identityKey,
        linkageResult,
        usedContributions: composeResult.usedContributions,
        ignoredContributions: composeResult.ignoredContributions,
        evaluation: preparationResult.evaluation,
        preparedRecord: preparationResult.preparedRecord,
        diagnosticNote: buildDiagnosticNote(linkageResult, composeResult),
    };
}

function buildDiagnosticNote(
    linkageResult: LinkageResultV1<YapCsvRowV1>,
    composeResult: ComposePreparationResultV1,
): string {
    if (composeResult.ignoredContributions.length > 0) {
        return `Compose ignored: ${composeResult.ignoredContributions.join(', ')}`;
    }

    if (linkageResult.linkageStatus === 'linked') {
        return `YAP linked via ${linkageResult.linkageReason}`;
    }

    return `No YAP enrichment applied: ${linkageResult.linkageReason}`;
}

function buildPreparationEvaluationId(
    batchRunId: string,
    aciRow: AciCsvRowV1,
): string {
    return `${batchRunId}|eval|${aciRow.sourceRowKey}`;
}

function buildEmptyStatusCounts(): Record<PreparationStatus, number> {
    return {
        ready: 0,
        ready_with_contact_warning: 0,
        needs_external_verification: 0,
        already_revised_elsewhere: 0,
        excluded_internal_revision_found: 0,
        insufficient_contact_data: 0,
        identity_mismatch_review_required: 0,
    };
}
