import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import {  AppLive } from "./app";

// Specify the port
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 5001;


AppLive.pipe(
  Layer.provide(
    BunHttpServer.layer({
      port
    })
  ),
  Layer.launch,
  BunRuntime.runMain
);

