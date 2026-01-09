import { ClientDocument, WebSocketTransport, Presence } from "@voidhash/mimic/client";
import { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";
import { getServerUrl } from "./serverConfig";

/**
 * Create a ClientDocument with presence support.
 * Uses the server URL from the current server configuration.
 */
export const createDocument = (documentId: string, initialPresence?: Presence.Infer<typeof PresenceSchema>) =>
  ClientDocument.make({
    debug: true,
    schema: MimicExampleSchema,
    presence: PresenceSchema,
    transport: WebSocketTransport.make({
      url: getServerUrl(),
      documentId,
    }),
    initialPresence,
  });