CREATE TABLE source_batches (
    source_batch_id TEXT PRIMARY KEY,
    source_system TEXT NOT NULL,
    source_reference TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_snapshot_hash TEXT NOT NULL,
    batch_status TEXT NOT NULL,
    CONSTRAINT source_batches_source_system_check
        CHECK (
            source_system IN (
                'aci_csv',
                'yap_csv',
                'echoes_read_model',
                'external_verification_adapter'
            )
        ),
    CONSTRAINT source_batches_batch_status_check
        CHECK (batch_status IN ('imported', 'processed', 'failed'))
);

CREATE TABLE raw_source_records (
    raw_record_id TEXT PRIMARY KEY,
    source_system TEXT NOT NULL,
    source_batch_id TEXT NOT NULL,
    source_row_key TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT raw_source_records_source_system_check
        CHECK (
            source_system IN (
                'aci_csv',
                'yap_csv',
                'echoes_read_model',
                'external_verification_adapter'
            )
        ),
    CONSTRAINT raw_source_records_source_batch_fk
        FOREIGN KEY (source_batch_id)
        REFERENCES source_batches (source_batch_id),
    CONSTRAINT raw_source_records_batch_row_unique
        UNIQUE (source_batch_id, source_row_key)
);

CREATE INDEX raw_source_records_source_system_idx
    ON raw_source_records (source_system);

CREATE TABLE external_verification_results (
    verification_result_id TEXT PRIMARY KEY,
    identity_key TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    last_revision_date DATE NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    verification_source TEXT NOT NULL,
    verification_channel TEXT NOT NULL,
    verification_trace JSONB NOT NULL,
    CONSTRAINT external_verification_results_status_check
        CHECK (
            verification_status IN (
                'not_checked',
                'verified_current',
                'already_revised_elsewhere',
                'not_verifiable',
                'check_failed'
            )
        ),
    CONSTRAINT external_verification_results_channel_check
        CHECK (
            verification_channel IN (
                'manual_portale',
                'assisted_portale',
                'mit_webservice',
                'ministerial_adapter_other'
            )
        )
);

CREATE INDEX external_verification_results_identity_idx
    ON external_verification_results (identity_key, verified_at DESC);

CREATE TABLE preparation_evaluations (
    preparation_evaluation_id TEXT PRIMARY KEY,
    identity_key TEXT NOT NULL,
    preparation_rule_version TEXT NOT NULL,
    evaluation_status TEXT NOT NULL,
    preparation_status TEXT NOT NULL,
    preparation_reasons JSONB NOT NULL,
    matching_trace JSONB NOT NULL,
    source_trace JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NULL,
    CONSTRAINT preparation_evaluations_status_check
        CHECK (evaluation_status IN ('started', 'completed', 'failed')),
    CONSTRAINT preparation_evaluations_preparation_status_check
        CHECK (
            preparation_status IN (
                'ready',
                'ready_with_contact_warning',
                'needs_external_verification',
                'already_revised_elsewhere',
                'excluded_internal_revision_found',
                'insufficient_contact_data',
                'identity_mismatch_review_required'
            )
        )
);

CREATE INDEX preparation_evaluations_identity_idx
    ON preparation_evaluations (identity_key);

CREATE TABLE prepared_records (
    prepared_record_id TEXT PRIMARY KEY,
    preparation_evaluation_id TEXT NOT NULL UNIQUE,
    prepared_key TEXT NOT NULL UNIQUE,
    identity_key TEXT NOT NULL,
    vehicle_identity JSONB NOT NULL,
    contact_profile JSONB NOT NULL,
    revision_verification JSONB NOT NULL,
    preparation_status TEXT NOT NULL,
    preparation_reasons JSONB NOT NULL,
    source_trace JSONB NOT NULL,
    preparation_rule_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT prepared_records_preparation_evaluation_fk
        FOREIGN KEY (preparation_evaluation_id)
        REFERENCES preparation_evaluations (preparation_evaluation_id),
    CONSTRAINT prepared_records_preparation_status_check
        CHECK (
            preparation_status IN (
                'ready',
                'ready_with_contact_warning',
                'needs_external_verification',
                'already_revised_elsewhere',
                'excluded_internal_revision_found',
                'insufficient_contact_data',
                'identity_mismatch_review_required'
            )
        )
);

CREATE INDEX prepared_records_identity_idx
    ON prepared_records (identity_key);

COMMENT ON TABLE source_batches IS
    'Imported source batch registry. Keeps the preparation layer restart-safe and traceable.';

COMMENT ON TABLE raw_source_records IS
    'Raw source rows or results retained as imported, before normalization and fusion.';

COMMENT ON TABLE external_verification_results IS
    'Traceable external verification outcomes, stored separately from preparation decisions.';

COMMENT ON TABLE preparation_evaluations IS
    'Deterministic evaluation log for one identity snapshot. Each evaluation produces zero or one prepared record.';

COMMENT ON TABLE prepared_records IS
    'Prepared reminder-ready records for downstream reminder processing. Each record belongs to exactly one evaluation.';

COMMENT ON COLUMN preparation_evaluations.identity_key IS
    'Deterministic operational identity of the candidate or vehicle case inside the fusion layer.';

COMMENT ON COLUMN preparation_evaluations.source_trace IS
    'Structured minimal trace: contributing raw records, winning sources, applied precedences, optional external verification, and final status reasons.';

COMMENT ON COLUMN external_verification_results.identity_key IS
    'Operational identity key used by the fusion layer to associate selective external verification outcomes.';

COMMENT ON COLUMN prepared_records.preparation_evaluation_id IS
    'Unique foreign key enforcing the v1 cardinality: one evaluation can own at most one prepared record.';

COMMENT ON COLUMN prepared_records.prepared_key IS
    'Deterministic key of the prepared output. Changes when materially relevant prepared data changes.';
