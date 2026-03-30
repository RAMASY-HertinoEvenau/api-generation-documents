import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";
import { AppError } from "../errors/AppError";

let isConnected = false;
let lastMongoError: string | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;

mongoose.connection.on("connected", () => {
  isConnected = true;
  lastMongoError = undefined;
  logger.info("MongoDB connected");
});

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  logger.warn("MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  isConnected = false;
  lastMongoError = error.message;
  logger.error({ err: error }, "MongoDB connection error");
});

export async function connectToMongo(options?: { throwOnError?: boolean }): Promise<boolean> {
  if (isConnected) {
    return true;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS
    });
    isConnected = true;
    lastMongoError = undefined;
    return true;
  } catch (error) {
    isConnected = false;
    lastMongoError = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "Unable to connect to MongoDB");

    if (options?.throwOnError) {
      throw error;
    }

    return false;
  }
}

export async function disconnectFromMongo(): Promise<void> {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = undefined;
  }

  if (!isConnected) {
    return;
  }

  await mongoose.disconnect();
  isConnected = false;
  logger.info("MongoDB disconnected");
}

export function startMongoReconnectLoop(runtimeLabel: string) {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setInterval(() => {
    if (isConnected) {
      return;
    }

    logger.warn({ runtimeLabel }, "Attempting MongoDB reconnection");
    void connectToMongo();
  }, env.MONGODB_RECONNECT_INTERVAL_MS);
}

export function getMongoHealth(): {
  status: "up" | "down";
  readyState: number;
  error?: string;
} {
  return {
    status: isConnected ? "up" : "down",
    readyState: mongoose.connection.readyState,
    error: lastMongoError
  };
}

export function assertMongoAvailable() {
  if (!isConnected) {
    throw new AppError(503, "MongoDB is unavailable");
  }
}
