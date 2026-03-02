export interface DatabaseInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CollectionInfo {
  readonly id: string;
  readonly databaseId: string;
  readonly name: string;
}

export interface UserInfo {
  readonly id: string;
  readonly username: string;
  readonly isSuperuser: boolean;
}

export interface GrantInfo {
  readonly id: string;
  readonly userId: string;
  readonly databaseId: string;
  readonly permission: string;
}

export interface CreatedDocumentToken {
  readonly token: string;
}

export interface DocumentSnapshot<TState = unknown> {
  readonly id: string;
  readonly collectionId: string;
  readonly state: TState;
  readonly version: number;
}
