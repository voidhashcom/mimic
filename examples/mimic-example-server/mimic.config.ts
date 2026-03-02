import { defineConfig, env, m } from "@voidhash/mimic-cli";
import { MimicExampleSchema } from "@voidhash/mimic-example-shared";

export default defineConfig({
  url: env.HOST_URL ?? "http://localhost:5001",
  username: env.HOST_USERNAME ?? "root",
  password: env.HOST_PASSWORD ?? "password",
  database: "example",
  collections: {
    todos: MimicExampleSchema,
  },
});
