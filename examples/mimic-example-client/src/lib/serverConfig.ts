/**
 * Server configuration for the Mimic example client.
 * Supports switching between standalone and cluster server implementations.
 */

export type ServerType = "standalone" | "cluster";

export interface ServerConfig {
  type: ServerType;
  name: string;
  url: string;
  port: number;
}

/**
 * Available server configurations
 */
export const servers: Record<ServerType, ServerConfig> = {
  standalone: {
    type: "standalone",
    name: "Standalone Server",
    url: "ws://localhost:5001/mimic/todo",
    port: 5001,
  },
  cluster: {
    type: "cluster",
    name: "Cluster Server",
    url: "ws://localhost:5002/mimic/todo",
    port: 5002,
  },
};

const STORAGE_KEY = "mimic-server-type";

/**
 * Get the current server type from localStorage
 */
export const getServerType = (): ServerType => {
  if (typeof window === "undefined") return "standalone";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "cluster") return "cluster";
  return "standalone";
};

/**
 * Set the server type in localStorage
 */
export const setServerType = (type: ServerType): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, type);
};

/**
 * Get the current server configuration
 */
export const getCurrentServer = (): ServerConfig => {
  return servers[getServerType()];
};

/**
 * Get the WebSocket URL for the current server
 */
export const getServerUrl = (): string => {
  return getCurrentServer().url;
};
