/**
 * Determines the "RunOrder" property for the next action to be added to a stage.
 * @param index Index of new action
 * @param concurrency The concurrency limit
 */
export function determineRunOrder(index: number, concurrency?: number) {
  // no runOrder if we are at unlimited concurrency
  if (concurrency === undefined) {
    return undefined;
  }

  return Math.floor(index / concurrency) + 1;
}
