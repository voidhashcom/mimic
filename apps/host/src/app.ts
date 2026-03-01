import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { Primitive } from "@voidhash/mimic";
import {
	MimicServer,
	MimicAuthService,
	MimicServerEngine,
	ColdStorage,
	HotStorage,
} from "@voidhash/mimic-effect";

// ==============================
// 1. SCHEMA
// ==============================

const PaywallNode = Primitive.TreeNode("paywall", {
	data: Primitive.Struct({
		name: Primitive.String().default("Untitled Paywall"),
	}),
	children: [],
});

const PaywallSchema = Primitive.Tree({
	root: PaywallNode,
});

// ==============================
// 2. MIMIC ENGINE
// ==============================

const CustomAuthLayer = MimicAuthService.make(
	Effect.gen(function* () {
		return {
			authenticate: (_token: string, _documentId: string) =>
				Effect.succeed({
					userId: "anonymous",
					permission: "write" as const,
				}),
		};
	}),
);

const StorageLayers = Layer.mergeAll(
	ColdStorage.InMemory.make(),
	HotStorage.InMemory.make(),
);

const EngineLive = MimicServerEngine.make({
	schema: PaywallSchema,
	initial: () =>
		Effect.succeed({
			type: "paywall" as const,
			name: "Untitled Paywall",
			children: [],
		}),
}).pipe(Layer.provide(StorageLayers), Layer.provide(CustomAuthLayer));

// ==============================
// 3. ROUTES
// ==============================

const MimicPaywallRoute = MimicServer.layerHttpLayerRouter({
	path: "/mimic/paywall-designer",
}).pipe(Layer.provide(EngineLive), Layer.provide(CustomAuthLayer));

const HealthCheckRoute = Layer.effectDiscard(
	Effect.gen(function* () {
		const router = yield* HttpRouter.HttpRouter;
		yield* router.add("GET", "/health", HttpServerResponse.text("OK"));
	}),
);

// ==============================
// 4. APPLICATION
// ==============================

const AllRoutes = Layer.mergeAll(MimicPaywallRoute, HealthCheckRoute).pipe(
	Layer.provide(
		HttpRouter.cors({
			allowedOrigins: ["*"],
			credentials: true,
		}),
	),
);

export const AppLive = HttpRouter.serve(AllRoutes);
