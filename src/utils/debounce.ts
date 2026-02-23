export type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  flush: () => void;
  cancel: () => void;
};

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): Debounced<TArgs> {
  let timeout: number | undefined;
  let pendingArgs: TArgs | null = null;

  const run = () => {
    if (pendingArgs) {
      fn(...pendingArgs);
      pendingArgs = null;
    }
    timeout = undefined;
  };

  const wrapped = ((...args: TArgs) => {
    pendingArgs = args;
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(run, delayMs);
  }) as Debounced<TArgs>;

  wrapped.flush = () => {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      run();
    }
  };

  wrapped.cancel = () => {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      timeout = undefined;
      pendingArgs = null;
    }
  };

  return wrapped;
}
