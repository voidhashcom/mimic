import { queryOptions } from "@tanstack/react-query";
import type { Credentials } from "./auth";
import { runRpc } from "./rpc";

export const databasesQuery = (creds: Credentials) =>
	queryOptions({
		queryKey: ["databases"],
		queryFn: () => runRpc(creds, (c) => c.ListDatabases()),
	});

export const collectionsQuery = (creds: Credentials, databaseId: string) =>
	queryOptions({
		queryKey: ["collections", databaseId],
		queryFn: () => runRpc(creds, (c) => c.ListCollections({ databaseId })),
		enabled: !!databaseId,
	});

export const documentsQuery = (creds: Credentials, collectionId: string) =>
	queryOptions({
		queryKey: ["documents", collectionId],
		queryFn: () => runRpc(creds, (c) => c.ListDocuments({ collectionId })),
		enabled: !!collectionId,
	});

export const documentQuery = (
	creds: Credentials,
	collectionId: string,
	documentId: string,
) =>
	queryOptions({
		queryKey: ["document", collectionId, documentId],
		queryFn: () =>
			runRpc(creds, (c) => c.GetDocument({ collectionId, documentId })),
		enabled: !!collectionId && !!documentId,
	});

export const usersQuery = (creds: Credentials) =>
	queryOptions({
		queryKey: ["users"],
		queryFn: () => runRpc(creds, (c) => c.ListUsers()),
	});

export const grantsQuery = (creds: Credentials, userId?: string) =>
	queryOptions({
		queryKey: ["grants", userId],
		queryFn: () => runRpc(creds, (c) => c.ListGrants({ userId })),
	});
