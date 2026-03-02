import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE users (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  yield* sql`
    CREATE TABLE user_grants (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      database_id VARCHAR(36) NOT NULL,
      permission ENUM('read', 'write', 'admin') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
      UNIQUE KEY uq_user_database (user_id, database_id)
    )
  `;

  yield* sql`
    CREATE TABLE document_tokens (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      collection_id VARCHAR(36) NOT NULL,
      document_id VARCHAR(36) NOT NULL,
      permission ENUM('read', 'write') NOT NULL DEFAULT 'read',
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `;

  yield* sql`DROP TABLE database_credentials`;
});
