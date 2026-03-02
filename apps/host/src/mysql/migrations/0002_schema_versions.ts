import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE collections
    ADD COLUMN schema_version INT NOT NULL DEFAULT 1
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS collection_schema_versions (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      collection_id VARCHAR(36) NOT NULL,
      version INT NOT NULL,
      schema_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      UNIQUE KEY uq_collection_version (collection_id, version)
    )
  `;

  yield* sql`
    INSERT INTO collection_schema_versions (collection_id, version, schema_json)
    SELECT id, 1, schema_json FROM collections
  `;
});
