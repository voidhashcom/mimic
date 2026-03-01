import { Data } from "effect";

export interface DocumentMeta {
  readonly id: string;
  readonly collectionId: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export class DocumentNotFoundError extends Data.TaggedError("DocumentNotFoundError")<{
  readonly documentId: string;
}> {}
