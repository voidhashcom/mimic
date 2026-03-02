import { Data } from "effect";

export class MimicSDKError extends Data.TaggedError("MimicSDKError")<{
  readonly message: string;
  readonly method?: string;
  readonly cause?: unknown;
}> {}
