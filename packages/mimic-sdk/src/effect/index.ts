export { MimicClientLayer, type MimicClientConfig } from "./HttpTransport";
export { MimicSDKError } from "./errors";
export type {
  DatabaseInfo,
  CollectionInfo,
  UserInfo,
  GrantInfo,
  CreatedDocumentToken,
  DocumentSnapshot,
} from "./types";
export { DatabaseHandle } from "./DatabaseHandle";
export { CollectionHandle } from "./CollectionHandle";
export * as MimicSDK from "./MimicSDK";
export type { MimicRpcRequirements } from "./MimicSDK";
export { MimicRpcs, CurrentUser, AuthMiddleware } from "@voidhash/mimic-protocol";
