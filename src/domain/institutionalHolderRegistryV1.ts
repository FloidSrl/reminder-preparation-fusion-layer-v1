import type { InstitutionalHolderRegistryEntryV1 } from './model.js';

export const DEFAULT_INSTITUTIONAL_HOLDER_REGISTRY_V1: InstitutionalHolderRegistryEntryV1[] = [
    {
        entryId: 'holder-registry-v1-001',
        kind: 'rental_fleet',
        canonicalName: 'ARVAL SERVICE LEASE ITALIA S.P.A.',
        aliases: ['ARVAL', 'ARVAL SERVICE LEASE ITALIA'],
        partitaIva: '04911190488',
        codiceFiscale: '04911190488',
        isActive: true,
        notes: 'Controlled fleet-rental example for v1 recipient resolution.',
    },
    {
        entryId: 'holder-registry-v1-002',
        kind: 'bank_finance',
        canonicalName: 'VOLKSWAGEN BANK GMBH',
        aliases: ['VOLKSWAGEN BANK', 'VW BANK'],
        partitaIva: '12576830155',
        codiceFiscale: '12576830155',
        isActive: true,
        notes: 'Controlled finance-holder example for v1 recipient resolution.',
    },
    {
        entryId: 'holder-registry-v1-003',
        kind: 'dealer',
        canonicalName: 'AUTO CENTRO RETAIL S.R.L.',
        aliases: ['AUTO CENTRO RETAIL', 'AUTO CENTRO'],
        partitaIva: '01234560987',
        isActive: true,
        notes: 'Controlled dealer example for v1 recipient resolution.',
    },
];
