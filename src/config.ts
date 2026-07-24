import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

type APIConfig = {
  fileserverHits: number;
  platform: string;
  jwtSecret: string;
  polkaKey: string;
};

type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

type Config = {
  api: APIConfig;
  db: DBConfig;
};

const migrationConfig: MigrationConfig = {
  migrationsFolder: "./src/db/migrations",
};

export const config: Config = {
  api: {
    fileserverHits: 0,
    platform: envOrThrow("PLATFORM"),
    jwtSecret: envOrThrow("JWT_SECRET"),
    polkaKey: envOrThrow("POLKA_KEY"),
  },
  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig: migrationConfig,
  },
};
