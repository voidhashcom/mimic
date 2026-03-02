import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { documentQuery } from "@/lib/queries";
import { runRpc } from "@/lib/rpc";

export const Route = createFileRoute(
	"/_app/_layout/collections/$collectionId/documents/$documentId",
)({
	component: DocumentPage,
});

function DocumentPage() {
	const { collectionId, documentId } = Route.useParams();
	const { credentials } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: document, isLoading } = useQuery(
		documentQuery(credentials, collectionId, documentId),
	);

	const [editJson, setEditJson] = useState("{}");
	const [tokenPermission, setTokenPermission] = useState<"read" | "write">(
		"read",
	);
	const [tokenExpiry, setTokenExpiry] = useState("");
	const [generatedToken, setGeneratedToken] = useState<string | null>(null);

	const updateMutation = useMutation({
		mutationFn: () => {
			const data = JSON.parse(editJson);
			return runRpc(credentials, (c) =>
				c.UpdateDocument({ collectionId, documentId, data }),
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["document", collectionId, documentId],
			});
			toast.success("Document updated (merge)");
		},
		onError: (err) => toast.error(`Update failed: ${err.message}`),
	});

	const setMutation = useMutation({
		mutationFn: () => {
			const data = JSON.parse(editJson);
			return runRpc(credentials, (c) =>
				c.SetDocument({ collectionId, documentId, data }),
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["document", collectionId, documentId],
			});
			toast.success("Document replaced");
		},
		onError: (err) => toast.error(`Set failed: ${err.message}`),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			runRpc(credentials, (c) =>
				c.DeleteDocument({ collectionId, documentId }),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["documents", collectionId],
			});
			toast.success("Document deleted");
			navigate({
				to: "/collections/$collectionId",
				params: { collectionId },
			});
		},
		onError: (err) => toast.error(`Delete failed: ${err.message}`),
	});

	const tokenMutation = useMutation({
		mutationFn: () =>
			runRpc(credentials, (c) =>
				c.CreateDocumentToken({
					collectionId,
					documentId,
					permission: tokenPermission,
					expiresInSeconds: tokenExpiry
						? Number(tokenExpiry)
						: undefined,
				}),
			),
		onSuccess: (result) => {
			setGeneratedToken(result.token);
			toast.success("Token created");
		},
		onError: (err) => toast.error(`Token creation failed: ${err.message}`),
	});

	if (isLoading) {
		return <p className="text-muted-foreground">Loading...</p>;
	}

	if (!document) {
		return <p className="text-muted-foreground">Document not found.</p>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold">Document</h2>
					<p className="text-sm text-muted-foreground">
						{documentId} (v{document.version})
					</p>
				</div>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete document?</AlertDialogTitle>
							<AlertDialogDescription>
								This will permanently delete this document.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => deleteMutation.mutate()}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Current State</CardTitle>
				</CardHeader>
				<CardContent>
					<pre className="overflow-auto rounded-md bg-muted p-4 text-sm">
						{JSON.stringify(document.state, null, 2)}
					</pre>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Edit Document</CardTitle>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="update">
						<TabsList>
							<TabsTrigger value="update">Update (merge)</TabsTrigger>
							<TabsTrigger value="set">Set (replace)</TabsTrigger>
						</TabsList>
						<TabsContent value="update" className="space-y-4">
							<Textarea
								value={editJson}
								onChange={(e) => setEditJson(e.target.value)}
								className="min-h-[200px] font-mono text-sm"
							/>
							<Button
								onClick={() => {
									try {
										JSON.parse(editJson);
										updateMutation.mutate();
									} catch {
										toast.error("Invalid JSON");
									}
								}}
								disabled={updateMutation.isPending}
							>
								{updateMutation.isPending
									? "Updating..."
									: "Update (Merge)"}
							</Button>
						</TabsContent>
						<TabsContent value="set" className="space-y-4">
							<Textarea
								value={editJson}
								onChange={(e) => setEditJson(e.target.value)}
								className="min-h-[200px] font-mono text-sm"
							/>
							<Button
								onClick={() => {
									try {
										JSON.parse(editJson);
										setMutation.mutate();
									} catch {
										toast.error("Invalid JSON");
									}
								}}
								disabled={setMutation.isPending}
								variant="outline"
							>
								{setMutation.isPending
									? "Replacing..."
									: "Set (Replace)"}
							</Button>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Document Token</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-end gap-4">
						<div className="grid gap-1">
							<Label className="text-xs">Permission</Label>
							<Select
								value={tokenPermission}
								onValueChange={(v) =>
									setTokenPermission(v as "read" | "write")
								}
							>
								<SelectTrigger className="w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="read">read</SelectItem>
									<SelectItem value="write">write</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-1">
							<Label className="text-xs">Expires in (seconds)</Label>
							<Input
								type="number"
								value={tokenExpiry}
								onChange={(e) => setTokenExpiry(e.target.value)}
								placeholder="Optional"
								className="w-36"
							/>
						</div>
						<Button
							onClick={() => tokenMutation.mutate()}
							disabled={tokenMutation.isPending}
						>
							{tokenMutation.isPending
								? "Generating..."
								: "Generate Token"}
						</Button>
					</div>
					{generatedToken && (
						<div className="flex items-center gap-2 rounded-md bg-muted p-3">
							<code className="flex-1 break-all text-xs">
								{generatedToken}
							</code>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => {
									navigator.clipboard.writeText(generatedToken);
									toast.success("Token copied to clipboard");
								}}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
