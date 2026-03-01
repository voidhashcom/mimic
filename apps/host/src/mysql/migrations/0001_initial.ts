import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS databases (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS database_credentials (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      database_id VARCHAR(36) NOT NULL,
      label VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      permission ENUM('read', 'write') NOT NULL DEFAULT 'read',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS collections (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      database_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      schema_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
      UNIQUE KEY uq_database_collection (database_id, name)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS documents (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      collection_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS document_snapshots (
      document_id VARCHAR(36) NOT NULL PRIMARY KEY,
      state_json JSON NOT NULL,
      version INT NOT NULL,
      schema_version INT NOT NULL DEFAULT 1,
      saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS document_wal (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      document_id VARCHAR(36) NOT NULL,
      version INT NOT NULL,
      transaction_json JSON NOT NULL,
      timestamp BIGINT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE KEY uq_document_version (document_id, version)
    )
  `;
});
