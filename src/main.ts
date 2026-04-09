import pino from 'pino';

const logger = pino({
    name: 'reminder-preparation-fusion-layer-v1',
});

logger.info(
    'Skeleton initialized. Repository intentionally contains contracts, migration, and preparation logic only.',
);
