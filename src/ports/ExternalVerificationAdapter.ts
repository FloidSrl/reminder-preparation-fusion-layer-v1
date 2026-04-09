import type {
    NormalizedVehicleIdentity,
    RevisionVerification,
    VerificationChannel,
} from '../domain/model.js';

export interface ExternalVerificationRequest {
    vehicleIdentity: NormalizedVehicleIdentity;
    requestedAt: string;
    requestedBy: 'system' | 'operator';
    reason: 'ambiguous_due' | 'revision_state_unknown' | 'identity_review';
}

export interface ExternalVerificationAdapterMetadata {
    adapterName: string;
    supportedChannels: VerificationChannel[];
}

export interface ExternalVerificationAdapter {
    readonly metadata: ExternalVerificationAdapterMetadata;

    verify(
        request: ExternalVerificationRequest,
    ): Promise<RevisionVerification>;
}
