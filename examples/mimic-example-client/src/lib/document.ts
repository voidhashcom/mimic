import { ClientDocument, WebSocketTransport, Presence } from "@voidhash/mimic/client";
import { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";
import { Schema } from "effect";

/**
 * Create a ClientDocument with presence support.
 */
export const createDocument = (documentId: string, initialPresence?: Presence.Infer<typeof PresenceSchema>) =>
  ClientDocument.make({
    debug: true,
    schema: MimicExampleSchema,
    presence: PresenceSchema,
    transport: WebSocketTransport.make({
      url: "ws://localhost:5001/mimic/todo",
      documentId,
    }),
    initialPresence,
  });