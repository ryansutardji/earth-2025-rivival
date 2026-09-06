/** Vitest global setup. Marks the environment as a React `act()` environment so
 * client-render smoke tests don't warn. */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
