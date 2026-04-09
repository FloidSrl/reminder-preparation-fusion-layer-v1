import type {
    PartyIdentityV1,
    PartyKind,
    TaxIdentityStatus,
    TaxIdentityWarning,
    TraceRef,
} from './model.js';

export interface NormalizePartyIdentityV1Input {
    partyKind: PartyKind;
    displayName?: string;
    givenName?: string;
    familyName?: string;
    businessName?: string;
    codiceFiscale?: string;
    partitaIva?: string;
    sourceTrace?: TraceRef[];
}

export function normalizePartyIdentityV1(
    input: NormalizePartyIdentityV1Input,
): PartyIdentityV1 {
    const givenName = normalizeText(input.givenName);
    const familyName = normalizeText(input.familyName);
    const businessName = normalizeText(input.businessName);
    const codiceFiscale = normalizeCodiceFiscale(input.codiceFiscale);
    const partitaIva = normalizePartitaIva(input.partitaIva);
    const displayName =
        normalizeText(input.displayName) ??
        deriveDisplayName(input.partyKind, givenName, familyName, businessName);

    if (!displayName) {
        throw new Error(
            'Party identity requires a displayName or enough subject fields to derive one',
        );
    }

    return {
        partyKind: input.partyKind,
        displayName,
        ...(givenName ? { givenName } : {}),
        ...(familyName ? { familyName } : {}),
        ...(businessName ? { businessName } : {}),
        ...(codiceFiscale ? { codiceFiscale } : {}),
        ...(partitaIva ? { partitaIva } : {}),
        taxIdentityStatus: buildTaxIdentityStatus(codiceFiscale, partitaIva),
        taxIdentityWarnings: buildTaxIdentityWarnings(
            codiceFiscale,
            partitaIva,
        ),
        sourceTrace: [...(input.sourceTrace ?? [])],
    };
}

function deriveDisplayName(
    partyKind: PartyKind,
    givenName: string | null,
    familyName: string | null,
    businessName: string | null,
): string | null {
    if (partyKind === 'organization') {
        return businessName;
    }

    const personalName = [givenName, familyName].filter(Boolean).join(' ');

    if (partyKind === 'natural_person') {
        return personalName || null;
    }

    return businessName ?? (personalName || null);
}

function buildTaxIdentityStatus(
    codiceFiscale: string | null,
    partitaIva: string | null,
): TaxIdentityStatus {
    if (codiceFiscale && partitaIva) {
        return 'codice_fiscale_and_partita_iva';
    }

    if (codiceFiscale) {
        return 'codice_fiscale_only';
    }

    if (partitaIva) {
        return 'partita_iva_only';
    }

    return 'missing_tax_identity';
}

function buildTaxIdentityWarnings(
    codiceFiscale: string | null,
    partitaIva: string | null,
): TaxIdentityWarning[] {
    const warnings: TaxIdentityWarning[] = [];

    if (codiceFiscale && !/^[A-Z0-9]{16}$/.test(codiceFiscale)) {
        warnings.push('codice_fiscale_format_warning');
    }

    if (partitaIva && !/^\d{11}$/.test(partitaIva)) {
        warnings.push('partita_iva_format_warning');
    }

    return warnings;
}

function normalizeCodiceFiscale(value?: string): string | null {
    const normalizedValue = normalizeIdentifier(value);

    return normalizedValue?.toUpperCase() ?? null;
}

function normalizePartitaIva(value?: string): string | null {
    const normalizedValue = normalizeIdentifier(value);

    return normalizedValue?.replace(/\D+/g, '') ?? null;
}

function normalizeIdentifier(value?: string): string | null {
    const normalizedValue = normalizeText(value);

    return normalizedValue?.replace(/\s+/g, '') ?? null;
}

function normalizeText(value?: string): string | null {
    if (value === undefined) {
        return null;
    }

    const normalizedValue = value.trim().replace(/\s+/g, ' ');

    return normalizedValue.length > 0 ? normalizedValue : null;
}
