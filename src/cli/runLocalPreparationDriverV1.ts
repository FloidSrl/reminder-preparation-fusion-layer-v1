import { writeFile } from 'node:fs/promises';

import {
    isLocalDriverFileParseErrorV1,
    runLocalPreparationDriverV1,
} from '../application/runLocalPreparationDriverV1.js';

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (!args.aciCsvPath || !args.yapCsvPath || !args.mode) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const now = new Date().toISOString();
    const result = await runLocalPreparationDriverV1({
        aciCsvPath: args.aciCsvPath,
        yapCsvPath: args.yapCsvPath,
        mode: args.mode,
        startedAt: now,
        createdAt: now,
        batchRunId: args.batchRunId ?? `local-driver|${now}`,
        ...(args.mocksFilePath ? { mocksFilePath: args.mocksFilePath } : {}),
    });

    console.log(`Mode: ${args.mode}`);
    console.log(`ACI input rows: ${result.summary.aciInputRowCount}`);
    console.log(`YAP input rows: ${result.summary.yapInputRowCount}`);
    console.log(`Row processed: ${result.summary.rowProcessedCount}`);
    console.log(`Row skipped: ${result.summary.rowSkippedCount}`);
    console.log(`Row errors: ${result.summary.rowErrorCount}`);
    console.log(`Processed count: ${result.summary.processedCount}`);
    console.log(`Prepared count: ${result.summary.preparedCount}`);
    console.log('Status counts:');

    for (const [status, count] of Object.entries(result.summary.statusCounts)) {
        console.log(`- ${status}: ${count}`);
    }

    console.log(
        `Records needing attention: ${formatList(result.summary.recordsNeedingAttention)}`,
    );
    console.log(`Records excluded: ${formatList(result.summary.recordsExcluded)}`);
    console.log(
        `Accepted ACI headers: ${result.inputDiagnostics.aciAcceptedHeaders.join(', ')}`,
    );
    console.log(
        `Accepted YAP headers: ${result.inputDiagnostics.yapAcceptedHeaders.join(', ')}`,
    );

    if (result.inputDiagnostics.rowIssues.length > 0) {
        console.log('Row issues:');

        for (const issue of result.inputDiagnostics.rowIssues) {
            console.log(
                `- ${issue.fileKind} row ${issue.rowNumber} (${issue.issueKind}): ${issue.message}`,
            );
        }
    }

    if (args.mode === 'dry_run') {
        console.log(
            `Dry-run payloads: ${result.summary.dryRunPayloadCount}`,
        );
    } else {
        console.log(
            `Applied payloads: ${result.summary.appliedPayloadCount}`,
        );
    }

    if (args.reportPath) {
        await writeFile(args.reportPath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Report written: ${args.reportPath}`);
    }
}

void main().catch((error: unknown) => {
    if (isLocalDriverFileParseErrorV1(error)) {
        console.error(
            `Local preparation driver file parse error (${error.fileKind}): ${error.message}`,
        );
    } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Local preparation driver failed: ${message}`);
    }

    process.exitCode = 1;
});

type ParsedArgs = {
    aciCsvPath?: string;
    yapCsvPath?: string;
    mode?: 'dry_run' | 'apply';
    mocksFilePath?: string;
    batchRunId?: string;
    reportPath?: string;
};

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = {};

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        const next = args[index + 1];

        if (arg === '--aci' && next) {
            parsed.aciCsvPath = next;
            index += 1;
            continue;
        }

        if (arg === '--yap' && next) {
            parsed.yapCsvPath = next;
            index += 1;
            continue;
        }

        if (arg === '--mode' && next) {
            if (next !== 'dry_run' && next !== 'apply') {
                throw new Error(`Unsupported mode: ${next}`);
            }

            parsed.mode = next;
            index += 1;
            continue;
        }

        if (arg === '--mocks' && next) {
            parsed.mocksFilePath = next;
            index += 1;
            continue;
        }

        if (arg === '--batch-run-id' && next) {
            parsed.batchRunId = next;
            index += 1;
            continue;
        }

        if (arg === '--report' && next) {
            parsed.reportPath = next;
            index += 1;
            continue;
        }
    }

    return parsed;
}

function printUsage(): void {
    console.log(
        'Usage: node dist/cli/runLocalPreparationDriverV1.js --aci <aci.csv> --yap <yap.csv> --mode <dry_run|apply> [--mocks <mocks.json>] [--batch-run-id <id>] [--report <report.json>]',
    );
}

function formatList(values: string[]): string {
    return values.length > 0 ? values.join(', ') : '(none)';
}
