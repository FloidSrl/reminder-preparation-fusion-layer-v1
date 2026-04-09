import { readFile } from 'node:fs/promises';

import type { AciCsvRowV1, YapCsvRowV1 } from './intakeV1.js';

type CanonicalAciHeader =
    | 'sourceBatchId'
    | 'sourceRowKey'
    | 'plate'
    | 'vehicleType'
    | 'dueMonth'
    | 'dueYear'
    | 'ownerName'
    | 'addressLine'
    | 'postalCode'
    | 'city'
    | 'province';

type CanonicalYapHeader =
    | 'sourceBatchId'
    | 'sourceRowKey'
    | 'plate'
    | 'vehicleType'
    | 'dueMonth'
    | 'dueYear'
    | 'contactName'
    | 'addressLine'
    | 'postalCode'
    | 'city'
    | 'province'
    | 'email'
    | 'phone';

type CsvRecord = Record<string, string>;
type CsvFileKind = 'aci' | 'yap';
type CsvRowErrorKind =
    | 'row_width_mismatch'
    | 'missing_required_field'
    | 'row_mapping_error';

interface CsvHeaderAliasV1<TCanonicalHeader extends string> {
    canonicalHeader: TCanonicalHeader;
    acceptedHeaders: string[];
    required: boolean;
}

interface ParsedCsvTableV1 {
    headers: string[];
    rows: Array<{
        rowNumber: number;
        cells: string[];
    }>;
    skippedBlankRowCount: number;
}

export interface CsvRowIssueV1 {
    fileKind: CsvFileKind;
    rowNumber: number;
    sourceRowKey?: string;
    issueKind: CsvRowErrorKind;
    message: string;
    rawRow: Record<string, string>;
}

export interface LoadedCsvRowsV1<TRow> {
    rows: TRow[];
    acceptedHeaders: string[];
    headerMapping: Record<string, string>;
    rowIssues: CsvRowIssueV1[];
    skippedBlankRowCount: number;
    skippedRowCount: number;
}

export class LocalDriverFileParseErrorV1 extends Error {
    constructor(
        readonly fileKind: CsvFileKind,
        readonly filePath: string,
        message: string,
    ) {
        super(message);
        this.name = 'LocalDriverFileParseErrorV1';
    }
}

export const ACI_HEADER_CATALOG_V1: CsvHeaderAliasV1<CanonicalAciHeader>[] = [
    {
        canonicalHeader: 'sourceBatchId',
        acceptedHeaders: ['sourceBatchId', 'source_batch_id', 'batchId', 'batch_id'],
        required: false,
    },
    {
        canonicalHeader: 'sourceRowKey',
        acceptedHeaders: ['sourceRowKey', 'source_row_key', 'rowKey', 'row_key'],
        required: false,
    },
    {
        canonicalHeader: 'plate',
        acceptedHeaders: ['plate', 'targa', 'plate_number'],
        required: true,
    },
    {
        canonicalHeader: 'vehicleType',
        acceptedHeaders: ['vehicleType', 'vehicle_type', 'tipoVeicolo', 'tipo_veicolo'],
        required: false,
    },
    {
        canonicalHeader: 'dueMonth',
        acceptedHeaders: ['dueMonth', 'due_month', 'meseScadenza', 'mese_scadenza'],
        required: true,
    },
    {
        canonicalHeader: 'dueYear',
        acceptedHeaders: ['dueYear', 'due_year', 'annoScadenza', 'anno_scadenza'],
        required: true,
    },
    {
        canonicalHeader: 'ownerName',
        acceptedHeaders: ['ownerName', 'owner_name', 'nominativo', 'intestatario'],
        required: false,
    },
    {
        canonicalHeader: 'addressLine',
        acceptedHeaders: ['addressLine', 'address_line', 'indirizzo'],
        required: false,
    },
    {
        canonicalHeader: 'postalCode',
        acceptedHeaders: ['postalCode', 'postal_code', 'cap'],
        required: false,
    },
    {
        canonicalHeader: 'city',
        acceptedHeaders: ['city', 'citta', 'comune'],
        required: false,
    },
    {
        canonicalHeader: 'province',
        acceptedHeaders: ['province', 'provincia'],
        required: false,
    },
];

export const YAP_HEADER_CATALOG_V1: CsvHeaderAliasV1<CanonicalYapHeader>[] = [
    {
        canonicalHeader: 'sourceBatchId',
        acceptedHeaders: ['sourceBatchId', 'source_batch_id', 'batchId', 'batch_id'],
        required: false,
    },
    {
        canonicalHeader: 'sourceRowKey',
        acceptedHeaders: ['sourceRowKey', 'source_row_key', 'rowKey', 'row_key'],
        required: false,
    },
    {
        canonicalHeader: 'plate',
        acceptedHeaders: ['plate', 'targa', 'plate_number'],
        required: false,
    },
    {
        canonicalHeader: 'vehicleType',
        acceptedHeaders: ['vehicleType', 'vehicle_type', 'tipoVeicolo', 'tipo_veicolo'],
        required: false,
    },
    {
        canonicalHeader: 'dueMonth',
        acceptedHeaders: ['dueMonth', 'due_month', 'meseScadenza', 'mese_scadenza'],
        required: false,
    },
    {
        canonicalHeader: 'dueYear',
        acceptedHeaders: ['dueYear', 'due_year', 'annoScadenza', 'anno_scadenza'],
        required: false,
    },
    {
        canonicalHeader: 'contactName',
        acceptedHeaders: ['contactName', 'contact_name', 'nomeContatto', 'nome_contatto'],
        required: false,
    },
    {
        canonicalHeader: 'addressLine',
        acceptedHeaders: ['addressLine', 'address_line', 'indirizzo'],
        required: false,
    },
    {
        canonicalHeader: 'postalCode',
        acceptedHeaders: ['postalCode', 'postal_code', 'cap'],
        required: false,
    },
    {
        canonicalHeader: 'city',
        acceptedHeaders: ['city', 'citta', 'comune'],
        required: false,
    },
    {
        canonicalHeader: 'province',
        acceptedHeaders: ['province', 'provincia'],
        required: false,
    },
    {
        canonicalHeader: 'email',
        acceptedHeaders: ['email', 'mail'],
        required: false,
    },
    {
        canonicalHeader: 'phone',
        acceptedHeaders: ['phone', 'telefono', 'cellulare', 'mobile'],
        required: false,
    },
];

export async function loadAciCsvRowsFromFileV1(
    filePath: string,
): Promise<AciCsvRowV1[]> {
    const result = await loadAciCsvRowsDetailedFromFileV1(filePath);

    return result.rows;
}

export async function loadYapCsvRowsFromFileV1(
    filePath: string,
): Promise<YapCsvRowV1[]> {
    const result = await loadYapCsvRowsDetailedFromFileV1(filePath);

    return result.rows;
}

export async function loadAciCsvRowsDetailedFromFileV1(
    filePath: string,
): Promise<LoadedCsvRowsV1<AciCsvRowV1>> {
    return loadCsvRowsDetailedFromFileV1(
        'aci',
        filePath,
        ACI_HEADER_CATALOG_V1,
        (record, rowNumber, index) => {
            const sourceRowKey =
                getOptionalValue(record, 'sourceRowKey') ?? `aci-row-${index + 1}`;

            return {
                sourceRowKey,
                plate: getRequiredValue(record, 'plate'),
                dueMonth: getRequiredValue(record, 'dueMonth'),
                dueYear: getRequiredValue(record, 'dueYear'),
                ...withOptionalField(
                    'sourceBatchId',
                    getOptionalValue(record, 'sourceBatchId'),
                ),
                ...withOptionalField(
                    'vehicleType',
                    getOptionalValue(record, 'vehicleType'),
                ),
                ...withOptionalField(
                    'ownerName',
                    getOptionalValue(record, 'ownerName'),
                ),
                ...withOptionalField(
                    'addressLine',
                    getOptionalValue(record, 'addressLine'),
                ),
                ...withOptionalField(
                    'postalCode',
                    getOptionalValue(record, 'postalCode'),
                ),
                ...withOptionalField('city', getOptionalValue(record, 'city')),
                ...withOptionalField(
                    'province',
                    getOptionalValue(record, 'province'),
                ),
            };
        },
    );
}

export async function loadYapCsvRowsDetailedFromFileV1(
    filePath: string,
): Promise<LoadedCsvRowsV1<YapCsvRowV1>> {
    return loadCsvRowsDetailedFromFileV1(
        'yap',
        filePath,
        YAP_HEADER_CATALOG_V1,
        (record, rowNumber, index) => ({
            sourceRowKey:
                getOptionalValue(record, 'sourceRowKey') ?? `yap-row-${index + 1}`,
            ...withOptionalField(
                'sourceBatchId',
                getOptionalValue(record, 'sourceBatchId'),
            ),
            ...withOptionalField('plate', getOptionalValue(record, 'plate')),
            ...withOptionalField(
                'vehicleType',
                getOptionalValue(record, 'vehicleType'),
            ),
            ...withOptionalField(
                'dueMonth',
                getOptionalValue(record, 'dueMonth'),
            ),
            ...withOptionalField(
                'dueYear',
                getOptionalValue(record, 'dueYear'),
            ),
            ...withOptionalField(
                'contactName',
                getOptionalValue(record, 'contactName'),
            ),
            ...withOptionalField(
                'addressLine',
                getOptionalValue(record, 'addressLine'),
            ),
            ...withOptionalField(
                'postalCode',
                getOptionalValue(record, 'postalCode'),
            ),
            ...withOptionalField('city', getOptionalValue(record, 'city')),
            ...withOptionalField(
                'province',
                getOptionalValue(record, 'province'),
            ),
            ...withOptionalField('email', getOptionalValue(record, 'email')),
            ...withOptionalField('phone', getOptionalValue(record, 'phone')),
        }),
    );
}

export async function loadCsvRecordsFromFileV1(
    filePath: string,
): Promise<CsvRecord[]> {
    const fileContents = await readFile(filePath, 'utf8');

    return parseCsvTextV1(fileContents);
}

export function parseCsvTextV1(text: string): CsvRecord[] {
    const table = parseCsvTableV1(text);

    if (table.headers.length === 0) {
        return [];
    }

    return table.rows.map((row) =>
        buildRecordFromHeaders(table.headers, row.cells),
    );
}

async function loadCsvRowsDetailedFromFileV1<TRow>(
    fileKind: CsvFileKind,
    filePath: string,
    headerCatalog: CsvHeaderAliasV1<string>[],
    mapRecord: (record: CsvRecord, rowNumber: number, index: number) => TRow,
): Promise<LoadedCsvRowsV1<TRow>> {
    let fileContents: string;

    try {
        fileContents = await readFile(filePath, 'utf8');
    } catch (error) {
        throw new LocalDriverFileParseErrorV1(
            fileKind,
            filePath,
            `Unable to read ${fileKind.toUpperCase()} CSV file: ${String(error)}`,
        );
    }

    let table: ParsedCsvTableV1;

    try {
        table = parseCsvTableV1(fileContents);
    } catch (error) {
        throw new LocalDriverFileParseErrorV1(
            fileKind,
            filePath,
            error instanceof Error ? error.message : String(error),
        );
    }

    const headerMapping = resolveHeaderMappingV1(
        fileKind,
        filePath,
        table.headers,
        headerCatalog,
    );
    const rowIssues: CsvRowIssueV1[] = [];
    const rows: TRow[] = [];

    table.rows.forEach((row, index) => {
        if (row.cells.length !== table.headers.length) {
            const rawRow = buildRecordFromHeaders(table.headers, row.cells);
            const sourceRowKey = getOptionalValue(rawRow, 'sourceRowKey');

            rowIssues.push({
                fileKind,
                rowNumber: row.rowNumber,
                ...(sourceRowKey ? { sourceRowKey } : {}),
                issueKind: 'row_width_mismatch',
                message: `Row ${row.rowNumber} has ${row.cells.length} columns, expected ${table.headers.length}`,
                rawRow,
            });
            return;
        }

        const rawRecord = buildRecordFromHeaders(table.headers, row.cells);
        const canonicalRecord = canonicalizeRecordV1(rawRecord, headerMapping);
        const sourceRowKey = getOptionalValue(canonicalRecord, 'sourceRowKey');

        try {
            rows.push(mapRecord(canonicalRecord, row.rowNumber, index));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            rowIssues.push({
                fileKind,
                rowNumber: row.rowNumber,
                ...(sourceRowKey ? { sourceRowKey } : {}),
                issueKind: message.includes('missing required field')
                    ? 'missing_required_field'
                    : 'row_mapping_error',
                message,
                rawRow: canonicalRecord,
            });
        }
    });

    return {
        rows,
        acceptedHeaders: table.headers,
        headerMapping,
        rowIssues,
        skippedBlankRowCount: table.skippedBlankRowCount,
        skippedRowCount: table.skippedBlankRowCount + rowIssues.length,
    };
}

function parseCsvTableV1(text: string): ParsedCsvTableV1 {
    const rows = parseCsvRowsV1(text);

    if (rows.length === 0) {
        return {
            headers: [],
            rows: [],
            skippedBlankRowCount: 0,
        };
    }

    const [headerRow, ...dataRows] = rows;

    if (!headerRow) {
        return {
            headers: [],
            rows: [],
            skippedBlankRowCount: 0,
        };
    }

    const headers = headerRow.map((header, index) => {
        const normalizedHeader = header.replace(/^\uFEFF/, '').trim();

        if (!normalizedHeader) {
            throw new Error(`CSV header at column ${index + 1} must not be empty`);
        }

        return normalizedHeader;
    });

    let skippedBlankRowCount = 0;
    const parsedRows = dataRows.flatMap((row, index) => {
        if (row.every((cell) => cell.trim().length === 0)) {
            skippedBlankRowCount += 1;
            return [];
        }

        return [
            {
                rowNumber: index + 2,
                cells: row,
            },
        ];
    });

    return {
        headers,
        rows: parsedRows,
        skippedBlankRowCount,
    };
}

function resolveHeaderMappingV1(
    fileKind: CsvFileKind,
    filePath: string,
    headers: string[],
    headerCatalog: CsvHeaderAliasV1<string>[],
): Record<string, string> {
    const mapping: Record<string, string> = {};

    for (const header of headers) {
        const normalizedHeader = normalizeHeaderToken(header);
        const matchedEntry = headerCatalog.find((entry) =>
            entry.acceptedHeaders.some(
                (acceptedHeader) =>
                    normalizeHeaderToken(acceptedHeader) === normalizedHeader,
            ),
        );

        if (matchedEntry) {
            mapping[header] = matchedEntry.canonicalHeader;
        }
    }

    const missingRequiredHeaders = headerCatalog
        .filter(
            (entry) =>
                entry.required &&
                !Object.values(mapping).includes(entry.canonicalHeader),
        )
        .map((entry) => entry.canonicalHeader);

    if (missingRequiredHeaders.length > 0) {
        throw new LocalDriverFileParseErrorV1(
            fileKind,
            filePath,
            `Missing required ${fileKind.toUpperCase()} headers: ${missingRequiredHeaders.join(', ')}`,
        );
    }

    return mapping;
}

function canonicalizeRecordV1(
    rawRecord: CsvRecord,
    headerMapping: Record<string, string>,
): CsvRecord {
    const canonicalRecord: CsvRecord = {};

    for (const [header, value] of Object.entries(rawRecord)) {
        const canonicalHeader = headerMapping[header];

        if (canonicalHeader) {
            canonicalRecord[canonicalHeader] = value;
        }
    }

    return canonicalRecord;
}

function buildRecordFromHeaders(headers: string[], cells: string[]): CsvRecord {
    const record: CsvRecord = {};

    for (let index = 0; index < Math.max(headers.length, cells.length); index += 1) {
        const header = headers[index];

        if (!header) {
            continue;
        }

        record[header] = cells[index] ?? '';
    }

    return record;
}

function parseCsvRowsV1(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (character === '"') {
            const nextCharacter = text[index + 1];

            if (insideQuotes && nextCharacter === '"') {
                currentValue += '"';
                index += 1;
                continue;
            }

            insideQuotes = !insideQuotes;
            continue;
        }

        if (character === ',' && !insideQuotes) {
            currentRow.push(currentValue);
            currentValue = '';
            continue;
        }

        if ((character === '\n' || character === '\r') && !insideQuotes) {
            if (character === '\r' && text[index + 1] === '\n') {
                index += 1;
            }

            currentRow.push(currentValue);
            rows.push(currentRow);
            currentRow = [];
            currentValue = '';
            continue;
        }

        currentValue += character ?? '';
    }

    if (insideQuotes) {
        throw new Error('CSV input contains an unterminated quoted field');
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
        currentRow.push(currentValue);
        rows.push(currentRow);
    }

    return rows;
}

function getRequiredValue(row: CsvRecord, ...keys: string[]): string {
    const value = getOptionalValue(row, ...keys);

    if (!value) {
        throw new Error(`CSV row is missing required field: ${keys[0]}`);
    }

    return value;
}

function getOptionalValue(row: CsvRecord, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = row[key];
        const normalizedValue = value?.trim();

        if (normalizedValue) {
            return normalizedValue;
        }
    }

    return undefined;
}

function normalizeHeaderToken(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function withOptionalField<TKey extends string>(
    key: TKey,
    value: string | undefined,
): Partial<Record<TKey, string>> {
    return value ? { [key]: value } as Record<TKey, string> : {};
}
