import { readFileSync } from "node:fs";
import { Config, Layer, Option, Redacted } from "effect";
import { MysqlClient, MysqlMigrator } from "@effect/sql-mysql2";
import migration0001 from "./migrations/0001_initial";
import migration0002 from "./migrations/0002_schema_versions";
import migration0003 from "./migrations/0003_auth_refactor";

const normalizePem = (value: string) => value.replace(/\\n/g, "\n");

type MysqlSslConfig = {
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized: boolean;
  verifyIdentity: boolean;
};

type MysqlSslSources = {
  ca: Option.Option<string>;
  caPath: Option.Option<string>;
  cert: Option.Option<string>;
  certPath: Option.Option<string>;
  key: Option.Option<string>;
  keyPath: Option.Option<string>;
  rejectUnauthorized: boolean;
  verifyIdentity: boolean;
};

const resolvePem = (
  value: Option.Option<string>,
  path: Option.Option<string>,
) =>
  Option.match(value, {
    onSome: normalizePem,
    onNone: () =>
      Option.match(path, {
        onSome: (filePath) => readFileSync(filePath, "utf8"),
        onNone: () => undefined,
      }),
  });

const makeSslConfig = (options: MysqlSslSources): MysqlSslConfig => {
  return {
    ca: resolvePem(options.ca, options.caPath),
    cert: resolvePem(options.cert, options.certPath),
    key: resolvePem(options.key, options.keyPath),
    rejectUnauthorized: options.rejectUnauthorized,
    verifyIdentity: options.verifyIdentity,
  };
};

const MysqlSslSourcesConfig = Config.all({
  ca: Config.string("CA").pipe(Config.option),
  caPath: Config.string("CA_PATH").pipe(Config.option),
  cert: Config.string("CERT").pipe(Config.option),
  certPath: Config.string("CERT_PATH").pipe(Config.option),
  key: Config.string("KEY").pipe(Config.option),
  keyPath: Config.string("KEY_PATH").pipe(Config.option),
  rejectUnauthorized: Config.boolean("REJECT_UNAUTHORIZED").pipe(
    Config.withDefault(true),
  ),
  verifyIdentity: Config.boolean("VERIFY_IDENTITY").pipe(
    Config.withDefault(true),
  ),
}).pipe(Config.nested("SSL"));

const MysqlClientConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("localhost")),
  port: Config.number("PORT").pipe(Config.withDefault(3306)),
  database: Config.string("NAME").pipe(Config.withDefault("voidsync")),
  username: Config.string("USERNAME").pipe(Config.withDefault("root")),
  password: Config.redacted("PASSWORD").pipe(
    Config.withDefault(Redacted.make("root_password")),
  ),
  sslEnabled: Config.boolean("SSL").pipe(Config.withDefault(false)),
  ssl: MysqlSslSourcesConfig,
}).pipe(
  Config.nested("DATABASE"),
  Config.map(
    ({ sslEnabled, ssl, ...config }) => ({
      ...config,
      poolConfig: sslEnabled ? { ssl: makeSslConfig(ssl) } : undefined,
    }),
  ),
);

const MysqlClientLive = MysqlClient.layerConfig(MysqlClientConfig);

const MysqlMigratorLive = MysqlMigrator.layer({
  loader: MysqlMigrator.fromRecord({
    "0001_initial": migration0001,
    "0002_schema_versions": migration0002,
    "0003_auth_refactor": migration0003,
  }),
});

export const MysqlLive = MysqlMigratorLive.pipe(
  Layer.provideMerge(MysqlClientLive),
);
