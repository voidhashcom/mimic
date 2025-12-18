import * as Operation from "./Operation";
import * as OperationPath from "./OperationPath";

export type ProxyEnvironment = {
  /** Adds an operation to be collected/applied */
  readonly addOperation: (operation: Operation.Operation<any, any, any>) => void;
  /** Gets the current state at the given path */
  readonly getState: (path: OperationPath.OperationPath) => unknown;
  /** Generates a unique ID (UUID) for array elements */
  readonly generateId: () => string;
};

export interface ProxyEnvironmentOptions {
  /** Callback when an operation is added */
  readonly onOperation: (operation: Operation.Operation<any, any, any>) => void;
  /** Function to retrieve current state at a path (defaults to returning undefined) */
  readonly getState?: (path: OperationPath.OperationPath) => unknown;
  /** Optional: Custom ID generator (defaults to crypto.randomUUID) */
  readonly generateId?: () => string;
}

/** Default UUID generator using crypto.randomUUID */
const defaultGenerateId = (): string => {
  return crypto.randomUUID();
};

/** Default state getter that always returns undefined */
const defaultGetState = (_path: OperationPath.OperationPath): unknown => {
  return undefined;
};

/**
 * Creates a ProxyEnvironment.
 * @param optionsOrCallback - Either an options object or a simple callback for operations
 */
export const make = (
  optionsOrCallback: ProxyEnvironmentOptions | ((operation: Operation.Operation<any, any, any>) => void)
): ProxyEnvironment => {
  // Support both old callback style and new options object
  const options: ProxyEnvironmentOptions =
    typeof optionsOrCallback === "function"
      ? { onOperation: optionsOrCallback }
      : optionsOrCallback;

  return {
    addOperation: (operation: Operation.Operation<any, any, any>) => {
      options.onOperation(operation);
    },
    getState: options.getState ?? defaultGetState,
    generateId: options.generateId ?? defaultGenerateId,
  };
};
