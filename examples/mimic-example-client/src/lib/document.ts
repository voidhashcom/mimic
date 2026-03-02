import { ClientDocument, WebSocketTransport, Presence } from "@voidhash/mimic/client";
import { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";
import { exampleServerUrl, hostWsBaseUrl } from "./serverConfig";

interface TokenResponse {
  token: string;
  databaseId: string;
  collectionId: string;
  documentId: string;
}

async function fetchToken(): Promise<TokenResponse> {
  const res = await fetch(`${exampleServerUrl}/api/token`);
  if (!res.ok) throw new Error(`Failed to fetch token: ${res.status}`);
  return res.json();
}

export async function createDocument(initialPresence?: Presence.Infer<typeof PresenceSchema>) {
  const { token, databaseId, collectionId, documentId } = await fetchToken();

  const wsUrl = `${hostWsBaseUrl}/ws/${databaseId}/${collectionId}`;

  return ClientDocument.make({
    debug: true,
    schema: MimicExampleSchema,
    presence: PresenceSchema,
    transport: WebSocketTransport.make({
      url: wsUrl,
      documentId,
      authToken: () => fetchToken().then((t) => t.token),
    }),
    initialPresence,
  });
}
