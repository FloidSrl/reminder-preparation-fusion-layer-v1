import type {
    HolderClassificationResultV1,
    HolderMatchedBy,
    InstitutionalHolderRegistryEntryV1,
    PartyIdentityV1,
    RecipientResolutionResultV1,
} from './model.js';

export interface ResolveRecipientFromOwnershipV1Input {
    registeredOwner: PartyIdentityV1;
    lesseeOrUser?: PartyIdentityV1 | null;
    registryEntries: InstitutionalHolderRegistryEntryV1[];
}

export function classifyInstitutionalHolderV1(
    registeredOwner: PartyIdentityV1,
    registryEntries: InstitutionalHolderRegistryEntryV1[],
): HolderClassificationResultV1 {
    const activeEntries = registryEntries.filter((entry) => entry.isActive);
    const normalizedHolderName = normalizeRegistryName(
        registeredOwner.businessName ?? registeredOwner.displayName,
    );

    for (const strategy of [
        {
            matchedBy: 'partita_iva_exact' as const,
            getMatches: () =>
                registeredOwner.partitaIva
                    ? activeEntries.filter(
                          (entry) =>
                              normalizeTaxIdentifier(entry.partitaIva) ===
                              registeredOwner.partitaIva,
                      )
                    : [],
        },
        {
            matchedBy: 'codice_fiscale_exact' as const,
            getMatches: () =>
                registeredOwner.codiceFiscale
                    ? activeEntries.filter(
                          (entry) =>
                              normalizeTaxIdentifier(entry.codiceFiscale) ===
                              registeredOwner.codiceFiscale,
                      )
                    : [],
        },
        {
            matchedBy: 'canonical_name_exact' as const,
            getMatches: () =>
                normalizedHolderName
                    ? activeEntries.filter(
                          (entry) =>
                              normalizeRegistryName(entry.canonicalName) ===
                              normalizedHolderName,
                      )
                    : [],
        },
        {
            matchedBy: 'alias_exact' as const,
            getMatches: () =>
                normalizedHolderName
                    ? activeEntries.filter((entry) =>
                          entry.aliases.some(
                              (alias) =>
                                  normalizeRegistryName(alias) ===
                                  normalizedHolderName,
                          ),
                      )
                    : [],
        },
    ]) {
        const matches = strategy.getMatches();

        if (matches.length === 1) {
            const matchedEntry = matches[0];

            if (!matchedEntry) {
                throw new Error('exact institutional holder match missing entry');
            }

            return {
                classificationStatus: 'matched',
                matchedBy: strategy.matchedBy,
                matchedEntry,
                normalizedHolderName,
                note: buildMatchedNote(strategy.matchedBy, matchedEntry),
            };
        }

        if (matches.length > 1) {
            return {
                classificationStatus: 'ambiguous',
                matchedBy: strategy.matchedBy,
                ambiguousEntries: matches,
                normalizedHolderName,
                note: `Registry match is ambiguous by ${strategy.matchedBy}`,
            };
        }
    }

    return {
        classificationStatus: 'not_matched',
        normalizedHolderName,
        note: 'Registered owner does not match the institutional holder registry',
    };
}

export function resolveRecipientFromOwnershipV1(
    input: ResolveRecipientFromOwnershipV1Input,
): RecipientResolutionResultV1 {
    const holderClassification = classifyInstitutionalHolderV1(
        input.registeredOwner,
        input.registryEntries,
    );

    if (holderClassification.classificationStatus === 'ambiguous') {
        return {
            resolutionStatus: 'review_required',
            resolutionReason: 'institutional_holder_match_ambiguous',
            registeredOwner: input.registeredOwner,
            resolvedRecipient: null,
            ...(input.lesseeOrUser ? { lesseeOrUser: input.lesseeOrUser } : {}),
            holderClassification,
            note: 'Registry match is ambiguous, so recipient substitution is not forced',
        };
    }

    if (holderClassification.classificationStatus === 'matched') {
        if (input.lesseeOrUser) {
            return {
                resolutionStatus: 'lessee_substituted',
                resolutionReason: 'institutional_holder_with_lessee',
                registeredOwner: input.registeredOwner,
                resolvedRecipient: input.lesseeOrUser,
                lesseeOrUser: input.lesseeOrUser,
                holderClassification,
                note: 'Institutional holder matched and recipient resolved to lessee or user',
            };
        }

        return {
            resolutionStatus: 'review_required',
            resolutionReason: 'institutional_holder_without_lessee',
            registeredOwner: input.registeredOwner,
            resolvedRecipient: null,
            holderClassification,
            note: 'Institutional holder matched but no reliable lessee or user is available',
        };
    }

    return {
        resolutionStatus: 'owner_retained',
        resolutionReason: 'non_institutional_owner',
        registeredOwner: input.registeredOwner,
        resolvedRecipient: input.registeredOwner,
        ...(input.lesseeOrUser ? { lesseeOrUser: input.lesseeOrUser } : {}),
        holderClassification,
        note: 'Registered owner is retained as final recipient',
    };
}

function buildMatchedNote(
    matchedBy: HolderMatchedBy,
    matchedEntry: InstitutionalHolderRegistryEntryV1,
): string {
    return `Institutional holder matched as ${matchedEntry.kind} by ${matchedBy}`;
}

function normalizeRegistryName(value?: string): string {
    if (!value) {
        return '';
    }

    return value
        .trim()
        .toUpperCase()
        .replace(/[.,/\\-]/g, ' ')
        .replace(/\s+/g, ' ');
}

function normalizeTaxIdentifier(value?: string): string | null {
    if (!value) {
        return null;
    }

    const normalizedValue = value.trim().replace(/\s+/g, '').toUpperCase();

    return normalizedValue.length > 0 ? normalizedValue : null;
}
