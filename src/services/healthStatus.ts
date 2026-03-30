export function resolveOverallHealthStatus(
  mongoStatus: "up" | "down" | "degraded",
  queueStatus: "up" | "down" | "degraded"
) {
  if (mongoStatus === "down" || queueStatus === "down") {
    return "down" as const;
  }

  if (mongoStatus === "degraded" || queueStatus === "degraded") {
    return "degraded" as const;
  }

  return "ok" as const;
}
