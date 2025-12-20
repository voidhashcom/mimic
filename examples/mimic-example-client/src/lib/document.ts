import { ClientDocument, WebSocketTransport } from "@voidhash/mimic/client";
import {MimicExampleSchema } from "@voidhash/mimic-example-shared";

export const createDocument = (documentId: string) => ClientDocument.make({
    debug: true,
    schema: MimicExampleSchema,
    transport: WebSocketTransport.make({
        url: "ws://localhost:5001/mimic/todo",
        documentId,
    }),
});