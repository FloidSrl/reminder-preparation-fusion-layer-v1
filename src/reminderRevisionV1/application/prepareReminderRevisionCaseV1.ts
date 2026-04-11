import { buildPreparedRecordV1 } from './buildPreparedRecordV1.js';
import { emitCommunicationIntentV1 } from './emitCommunicationIntentV1.js';
import { evaluateReminderRevisionV1 } from './evaluateReminderRevisionV1.js';
import type {
    PrepareReminderRevisionCaseResultV1,
    ReminderRevisionCaseV1,
} from '../domain/types.js';

export function prepareReminderRevisionCaseV1(
    input: ReminderRevisionCaseV1,
): PrepareReminderRevisionCaseResultV1 {
    const evaluation = evaluateReminderRevisionV1(input);
    const preparedRecord = buildPreparedRecordV1(input, evaluation);
    const communicationIntentResult = emitCommunicationIntentV1(input, preparedRecord);

    return communicationIntentResult.intent
        ? {
              preparedRecord,
              communicationIntent: communicationIntentResult.intent,
          }
        : {
              preparedRecord,
          };
}
