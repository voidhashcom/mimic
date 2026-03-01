import { Config, Layer, Redacted } from "effect";
import { MysqlClient, MysqlMigrator } from "@effect/sql-mysql2";
import migration0001 from "./migrations/0001_initial";
import migration0002 from "./migrations/0002_schema_versions";

const MysqlClientLive = MysqlClient.layerConfig(
  Config.all({
    host: Config.string("DATABASE_HOST").pipe(Config.withDefault("localhost")),
    port: Config.number("DATABASE_PORT").pipe(Config.withDefault(3306)),
    database: Config.string("DATABASE_NAME").pipe(Config.withDefault("mimic")),
    username: Config.string("DATABASE_USERNAME").pipe(Config.withDefault("root")),
    password: Config.redacted("DATABASE_PASSWORD").pipe(
      Config.withDefault(Redacted.make("")),
    ),
  }),
);

const MysqlMigratorLive = MysqlMigrator.layer({
  loader: MysqlMigrator.fromRecord({
    "0001_initial": migration0001,
    "0002_schema_versions": migration0002,
  }),
});

export const MysqlLive = MysqlMigratorLive.pipe(
  Layer.provideMerge(MysqlClientLive),
);
