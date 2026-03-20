import { ValidationError } from "@/shared/errors";
import type { RecoverStuckEventsInput } from "./types";

const DEFAULT_THRESHOLD_MINUTES = 15;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 1440;

export function validateRecoverStuckEventsInput(input: RecoverStuckEventsInput): {
  thresholdMinutes: number;
  limit: number;
  dryRun: boolean;
} {
  const thresholdMinutes = input.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const dryRun = input.dryRun ?? false;

  if (typeof thresholdMinutes !== "number" || thresholdMinutes < MIN_THRESHOLD || thresholdMinutes > MAX_THRESHOLD) {
    throw new ValidationError(
      `thresholdMinutes must be between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}`,
    );
  }

  if (typeof limit !== "number" || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be between 1 and ${MAX_LIMIT}`);
  }

  if (typeof dryRun !== "boolean") {
    throw new ValidationError("dryRun must be a boolean");
  }

  return { thresholdMinutes, limit, dryRun };
}
