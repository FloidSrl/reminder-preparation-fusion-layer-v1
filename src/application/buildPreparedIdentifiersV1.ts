import type { PreparedKey } from '../domain/model.js';
import type {
    ExternalVerificationInputV1,
    NormalizedAciContributionV1,
    NormalizedYapContributionV1,
} from '../input/intakeV1.js';
import type { EchoesRevisionStateInputV1 } from './composePreparationInputV1.js';

export interface BuildPreparedIdentifiersV1Input {
    batchRunId: string;
    aciSourceRowKey: string;
    aciContribution: NormalizedAciContributionV1;
    linkedYapContribution: NormalizedYapContributionV1 | null;
    externalVerificationInput?: ExternalVerificationInputV1;
    echoesState?: EchoesRevisionStateInputV1;
}

export interface PreparedIdentifiersV1 {
    preparedRecordId: string;
    preparedKey: PreparedKey;
}

export function buildPreparedIdentifiersV1(
    input: BuildPreparedIdentifiersV1Input,
): PreparedIdentifiersV1 {
    const contactProfile = input.linkedYapContribution?.contactProfile;
    const preparedKey = [
        input.aciContribution.vehicleIdentity.identityKey,
        `name=${contactProfile?.name.value ?? input.aciContribution.candidateContactHint.name.value ?? ''}`,
        `address=${contactProfile?.address.value ?? input.aciContribution.candidateContactHint.address.value ?? ''}`,
        `email=${contactProfile?.email.value ?? ''}`,
        `phone=${contactProfile?.phone.value ?? ''}`,
        `verification=${input.externalVerificationInput?.verificationStatus ?? 'not_checked'}`,
        `internal_revision=${input.echoesState?.internalRevisionFound ?? false}`,
    ].join('|');

    return {
        preparedRecordId: `${input.batchRunId}|prepared|${input.aciSourceRowKey}`,
        preparedKey,
    };
}
