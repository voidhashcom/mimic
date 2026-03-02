import { Data, Effect } from "effect";

export class FailedToLoadConfigFileError extends Data.TaggedError("FailedToLoadConfigFileError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const assertES5 = ({ unregister }: { unregister: () => void }) =>
  Effect.try({
    try: () => require("./_es5.ts"),
    catch: (e: any) => {
      unregister();
      if ("errors" in e && Array.isArray(e.errors) && e.errors.length > 0) {
        const es5Error = (e.errors as any[]).some((it) =>
          it.text?.includes(`("es5") is not supported yet`)
        );
        if (es5Error) {
          return new FailedToLoadConfigFileError({
            cause: e,
            message: "An error occurred while trying to load config file.",
          });
        }
      }
      return new FailedToLoadConfigFileError({ cause: e, message: "An error occurred while loading config file." });
    },
  });

export const safeRegister = () =>
  Effect.gen(function* () {
    const { register } = yield* Effect.tryPromise({
      catch: (e) => new FailedToLoadConfigFileError({ cause: e, message: "An error occurred while trying to load config file." }),
      try: () => import("esbuild-register/dist/node"),
    });
    const res: { unregister: () => void } = yield* Effect.try({
      catch: (e) => new FailedToLoadConfigFileError({ cause: e, message: "An error occurred while trying to load config file." }),
      try: () => register({ format: "cjs", loader: "ts" }),
    }).pipe(
      Effect.orElseSucceed(() => ({ unregister(): void {} }))
    );
    yield* assertES5(res);
    return res;
  });

export const loadConfigFile = (filePath: string) =>
  Effect.gen(function* () {
    const { unregister } = yield* safeRegister();
    try {
      const module = require(filePath);
      const config = module.default ?? module;
      return config;
    } catch (e) {
      throw new FailedToLoadConfigFileError({
        cause: e,
        message: `Failed to load config file: ${filePath}`,
      });
    } finally {
      unregister();
    }
  });
