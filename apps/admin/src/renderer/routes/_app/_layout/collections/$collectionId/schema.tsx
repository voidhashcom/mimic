import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { runRpc } from "@/lib/rpc";

export const Route = createFileRoute(
	"/_app/_layout/collections/$collectionId/schema",
)({
	component: SchemaPage,
});

function SchemaPage() {
	const { collectionId } = Route.useParams();
	const { credentials } = useAuth();
	const queryClient = useQueryClient();

	const [schemaJson, setSchemaJson] = useState("{}");

	const updateMutation = useMutation({
		mutationFn: () => {
			const parsed = JSON.parse(schemaJson);
			return runRpc(credentials, (c) =>
				c.UpdateCollectionSchema({ id: collectionId, schemaJson: parsed }),
			);
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: ["collections"],
			});
			toast.success(
				`Schema updated to version ${result.schemaVersion}`,
			);
		},
		onError: (err) =>
			toast.error(`Failed to update schema: ${err.message}`),
	});

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">Collection Schema</h2>
				<p className="text-sm text-muted-foreground">
					Collection: {collectionId}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Update Schema</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							try {
								JSON.parse(schemaJson);
								updateMutation.mutate();
							} catch {
								toast.error("Invalid JSON");
							}
						}}
						className="grid gap-4"
					>
						<div className="grid gap-2">
							<Label>Schema JSON</Label>
							<Textarea
								value={schemaJson}
								onChange={(e) => setSchemaJson(e.target.value)}
								className="min-h-[300px] font-mono text-sm"
							/>
						</div>
						<Button
							type="submit"
							disabled={updateMutation.isPending}
							className="w-fit"
						>
							{updateMutation.isPending
								? "Updating..."
								: "Update Schema"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
