import type {
    LinkageCriterion,
    LinkageReason,
    LinkageResultV1,
} from '../domain/model.js';
import type { AciCsvRowV1, YapCsvRowV1 } from './intakeV1.js';

export function linkAciToYapV1(
    aciRow: AciCsvRowV1,
    yapRows: YapCsvRowV1[],
): LinkageResultV1<YapCsvRowV1> {
    const normalizedAciPlate = normalizePlate(aciRow.plate);
    const normalizedAciVehicleType = normalizeVehicleType(aciRow.vehicleType);
    const normalizedAciDueContext = normalizeDueContext(
        aciRow.dueMonth,
        aciRow.dueYear,
    );

    const candidatesWithDerivedFields = yapRows.map((row) => ({
        row,
        normalizedPlate: row.plate ? normalizePlate(row.plate) : null,
        normalizedVehicleType: normalizeVehicleType(row.vehicleType),
        normalizedDueContext: normalizeOptionalDueContext(row.dueMonth, row.dueYear),
        supportCriteria: collectSupportCriteria(row),
    }));

    const criteriaUsed: LinkageCriterion[] = [];
    const supportFieldsUsed = new Set<
        'vehicle_type' | 'due_context' | 'name' | 'email' | 'phone'
    >();

    const exactPlateMatches = candidatesWithDerivedFields.filter(
        (candidate) => candidate.normalizedPlate === normalizedAciPlate,
    );

    if (exactPlateMatches.length === 0) {
        const missingPlateCandidates = candidatesWithDerivedFields.filter(
            (candidate) => candidate.normalizedPlate === null,
        );

        if (missingPlateCandidates.length > 0) {
            criteriaUsed.push('missing_plate');
            pushCriteria(criteriaUsed, missingPlateCandidates[0]?.supportCriteria ?? []);
            collectSupportFields(supportFieldsUsed, criteriaUsed);

            return buildLinkageResult(
                'not_linked',
                hasSupportCriteria(criteriaUsed)
                    ? 'insufficient_linkage_evidence'
                    : 'missing_plate_on_yap',
                null,
                criteriaUsed,
                0,
                supportFieldsUsed,
                'YAP rows without a strong plate key cannot be deterministically linked in v1.',
            );
        }

        return buildLinkageResult(
            'not_linked',
            'no_plate_match',
            null,
            criteriaUsed,
            0,
            supportFieldsUsed,
            'No YAP row shares the same normalized plate as the ACI candidate.',
        );
    }

    criteriaUsed.push('plate_exact');

    const plateAndTypeMatches = exactPlateMatches.filter((candidate) => {
        if (!normalizedAciVehicleType || !candidate.normalizedVehicleType) {
            return false;
        }

        return candidate.normalizedVehicleType === normalizedAciVehicleType;
    });

    if (plateAndTypeMatches.length === 1) {
        const matchedCandidate = plateAndTypeMatches[0];

        if (!matchedCandidate) {
            throw new Error('Expected exactly one plate and vehicle type match');
        }

        criteriaUsed.push('vehicle_type_match');
        supportFieldsUsed.add('vehicle_type');
        pushCriteria(criteriaUsed, matchedCandidate.supportCriteria);
        collectSupportFields(supportFieldsUsed, criteriaUsed);

        return buildLinkageResult(
            'linked',
            'exact_plate_and_vehicle_type_match',
            matchedCandidate.row,
            criteriaUsed,
            exactPlateMatches.length,
            supportFieldsUsed,
            'Exact plate match is confirmed by matching vehicle type.',
        );
    }

    if (plateAndTypeMatches.length > 1) {
        criteriaUsed.push('vehicle_type_match', 'multiple_candidates');
        supportFieldsUsed.add('vehicle_type');

        const dueContextResolved = resolveByDueContext(
            plateAndTypeMatches,
            normalizedAciDueContext,
            criteriaUsed,
            supportFieldsUsed,
        );

        if (dueContextResolved) {
            return dueContextResolved;
        }

        return buildLinkageResult(
            'ambiguous',
            'multiple_yap_rows_same_plate',
            null,
            criteriaUsed,
            exactPlateMatches.length,
            supportFieldsUsed,
            'More than one YAP row shares the same strong plate key and remains viable after support checks.',
        );
    }

    const candidatesWithVehicleTypeConflict = exactPlateMatches.filter(
        (candidate) =>
            normalizedAciVehicleType !== undefined &&
            candidate.normalizedVehicleType !== undefined &&
            candidate.normalizedVehicleType !== normalizedAciVehicleType,
    );

    if (candidatesWithVehicleTypeConflict.length === exactPlateMatches.length) {
        criteriaUsed.push('vehicle_type_conflict');
        supportFieldsUsed.add('vehicle_type');
        pushCriteria(
            criteriaUsed,
            candidatesWithVehicleTypeConflict[0]?.supportCriteria ?? [],
        );
        collectSupportFields(supportFieldsUsed, criteriaUsed);

        return buildLinkageResult(
            'rejected',
            'vehicle_type_conflict',
            null,
            criteriaUsed,
            exactPlateMatches.length,
            supportFieldsUsed,
            'All exact-plate YAP candidates conflict with the ACI vehicle type.',
        );
    }

    const dueContextResolved = resolveByDueContext(
        exactPlateMatches,
        normalizedAciDueContext,
        criteriaUsed,
        supportFieldsUsed,
    );

    if (dueContextResolved) {
        return dueContextResolved;
    }

    if (exactPlateMatches.length > 1) {
        criteriaUsed.push('multiple_candidates');
        collectSupportFields(supportFieldsUsed, criteriaUsed);

        return buildLinkageResult(
            'ambiguous',
            'multiple_yap_rows_same_plate',
            null,
            criteriaUsed,
            exactPlateMatches.length,
            supportFieldsUsed,
            'Exact plate match exists but does not uniquely identify one YAP row.',
        );
    }

    const matchedCandidate = exactPlateMatches[0];

    if (!matchedCandidate) {
        throw new Error('Expected exactly one exact plate match');
    }

    pushCriteria(criteriaUsed, matchedCandidate.supportCriteria);
    collectSupportFields(supportFieldsUsed, criteriaUsed);

    return buildLinkageResult(
        'linked',
        'exact_plate_match',
        matchedCandidate.row,
        criteriaUsed,
        exactPlateMatches.length,
        supportFieldsUsed,
        'Exact normalized plate match is sufficient in v1 when no support field rejects the candidate.',
    );
}

function resolveByDueContext(
    candidates: Candidate[],
    aciDueContext: string,
    criteriaUsed: LinkageCriterion[],
    supportFieldsUsed: Set<
        'vehicle_type' | 'due_context' | 'name' | 'email' | 'phone'
    >,
): LinkageResultV1<YapCsvRowV1> | null {
    const dueMatches = candidates.filter(
        (candidate) =>
            candidate.normalizedDueContext !== null &&
            candidate.normalizedDueContext === aciDueContext,
    );

    if (dueMatches.length === 1) {
        const matchedCandidate = dueMatches[0];

        if (!matchedCandidate) {
            throw new Error('Expected exactly one due-context match');
        }

        if (!criteriaUsed.includes('due_month_match')) {
            criteriaUsed.push('due_month_match', 'due_year_match');
        }
        supportFieldsUsed.add('due_context');
        pushCriteria(criteriaUsed, matchedCandidate.supportCriteria);
        collectSupportFields(supportFieldsUsed, criteriaUsed);

        return buildLinkageResult(
            'linked',
            'exact_plate_with_due_context_support',
            matchedCandidate.row,
            criteriaUsed,
            candidates.length,
            supportFieldsUsed,
            'Exact plate match is uniquely disambiguated by due context support.',
        );
    }

    if (
        candidates.some((candidate) => candidate.normalizedDueContext !== null) &&
        dueMatches.length === 0
    ) {
        criteriaUsed.push('due_context_conflict');
        supportFieldsUsed.add('due_context');
        pushCriteria(criteriaUsed, candidates[0]?.supportCriteria ?? []);
        collectSupportFields(supportFieldsUsed, criteriaUsed);

        return buildLinkageResult(
            'ambiguous',
            'due_context_conflict',
            null,
            criteriaUsed,
            candidates.length,
            supportFieldsUsed,
            'Exact plate match exists, but available due context support conflicts with the ACI candidate.',
        );
    }

    return null;
}

type Candidate = {
    row: YapCsvRowV1;
    normalizedPlate: string | null;
    normalizedVehicleType: string | undefined;
    normalizedDueContext: string | null;
    supportCriteria: LinkageCriterion[];
};

function buildLinkageResult(
    linkageStatus: LinkageResultV1<YapCsvRowV1>['linkageStatus'],
    linkageReason: LinkageReason,
    matchedCandidate: YapCsvRowV1 | null,
    criteriaUsed: LinkageCriterion[],
    matchedCandidatesCount: number,
    supportFieldsUsed: Set<
        'vehicle_type' | 'due_context' | 'name' | 'email' | 'phone'
    >,
    note: string,
): LinkageResultV1<YapCsvRowV1> {
    return {
        linkageStatus,
        linkageReason,
        matchedCandidate,
        criteriaUsed: dedupeCriteria(criteriaUsed),
        matchedCandidatesCount,
        supportFieldsUsed: [...supportFieldsUsed],
        note,
    };
}

function collectSupportCriteria(row: YapCsvRowV1): LinkageCriterion[] {
    const criteria: LinkageCriterion[] = [];

    if (hasMeaningfulValue(row.contactName)) {
        criteria.push('name_support_present');
    }

    if (hasMeaningfulValue(row.email)) {
        criteria.push('email_support_present');
    }

    if (hasMeaningfulValue(row.phone)) {
        criteria.push('phone_support_present');
    }

    return criteria;
}

function hasSupportCriteria(criteria: LinkageCriterion[]): boolean {
    return criteria.some((criterion) =>
        ['name_support_present', 'email_support_present', 'phone_support_present'].includes(
            criterion,
        ),
    );
}

function collectSupportFields(
    supportFieldsUsed: Set<
        'vehicle_type' | 'due_context' | 'name' | 'email' | 'phone'
    >,
    criteriaUsed: LinkageCriterion[],
): void {
    if (criteriaUsed.includes('name_support_present')) {
        supportFieldsUsed.add('name');
    }

    if (criteriaUsed.includes('email_support_present')) {
        supportFieldsUsed.add('email');
    }

    if (criteriaUsed.includes('phone_support_present')) {
        supportFieldsUsed.add('phone');
    }
}

function pushCriteria(
    target: LinkageCriterion[],
    criteria: LinkageCriterion[],
): void {
    for (const criterion of criteria) {
        target.push(criterion);
    }
}

function dedupeCriteria(criteria: LinkageCriterion[]): LinkageCriterion[] {
    return [...new Set(criteria)];
}

function normalizePlate(value: string): string {
    return value.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeVehicleType(value?: string): string | undefined {
    if (!hasMeaningfulValue(value)) {
        return undefined;
    }

    return value!.trim().toLowerCase();
}

function normalizeDueContext(
    dueMonth: string | number,
    dueYear: string | number,
): string {
    return `${Number(dueYear)}-${String(Number(dueMonth)).padStart(2, '0')}`;
}

function normalizeOptionalDueContext(
    dueMonth?: string | number,
    dueYear?: string | number,
): string | null {
    if (dueMonth === undefined || dueYear === undefined) {
        return null;
    }

    return normalizeDueContext(dueMonth, dueYear);
}

function hasMeaningfulValue(value?: string): boolean {
    return value !== undefined && value.trim().length > 0;
}
