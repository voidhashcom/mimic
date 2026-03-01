export interface DatabaseInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface CollectionInfo {
  readonly id: string;
  readonly databaseId: string;
  readonly name: string;
}

export interface CredentialInfo {
  readonly id: string;
  readonly label: string;
  readonly permission: string;
}

export interface CreatedCredential {
  readonly id: string;
  readonly token: string;
}

export interface DocumentSnapshot<TState = unknown> {
  readonly id: string;
  readonly collectionId: string;
  readonly state: TState;
  readonly version: number;
}
