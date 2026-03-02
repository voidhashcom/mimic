import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCredentials } from "@/lib/auth";
import { runRpc } from "@/lib/rpc";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const [serverUrl, setServerUrl] = useState("http://localhost:5001");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);

		const creds = { serverUrl, username, password };

		try {
			await runRpc(creds, (client) => client.ListDatabases());
			setCredentials(creds);
			navigate({ to: "/" });
		} catch (err) {
			toast.error(
				`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-2xl">Mimic Admin</CardTitle>
					<CardDescription>
						Connect to a mimic-host instance to manage your databases.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="serverUrl">Server URL</Label>
							<Input
								id="serverUrl"
								value={serverUrl}
								onChange={(e) => setServerUrl(e.target.value)}
								placeholder="http://localhost:5001"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								autoComplete="username"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="current-password"
							/>
						</div>
						<Button type="submit" disabled={loading} className="w-full">
							{loading ? "Connecting..." : "Connect"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
