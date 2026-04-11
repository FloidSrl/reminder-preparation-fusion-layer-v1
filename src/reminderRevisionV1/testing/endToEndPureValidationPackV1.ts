import type { EchoesRealisticFixtureV1 } from './echoesRealisticFixturePackV1.js';
import { echoesRealisticFixturePackV1 } from './echoesRealisticFixturePackV1.js';

export interface EndToEndPureValidationScenarioV1 {
    scenario_id: string;
    fixture: EchoesRealisticFixtureV1;
}

const requiredScenarioIds = [
    'echoes_realistic_ready_clean_revision_due',
    'echoes_realistic_extracted_due_with_mixed_addressing',
    'echoes_realistic_artifact_only_without_due_fact',
    'echoes_realistic_conflict_between_observation_and_external_due',
    'echoes_realistic_duplicate_relation_requires_core_decision',
] as const;

export const endToEndPureValidationPackV1: EndToEndPureValidationScenarioV1[] =
    requiredScenarioIds.map((scenarioId) => {
        const fixture = echoesRealisticFixturePackV1.find(
            (candidate) => candidate.scenario_id === scenarioId,
        );

        if (!fixture) {
            throw new Error(
                `missing realistic Echoes fixture required by end-to-end pack: ${scenarioId}`,
            );
        }

        return {
            scenario_id: scenarioId,
            fixture,
        };
    });
