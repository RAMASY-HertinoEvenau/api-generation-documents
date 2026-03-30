import { getMongoHealth } from "../config/mongo";
import { documentQueue } from "../queues/documentQueue";
import { getDocuSignCircuitBreakerState } from "./docusignService";
import { resolveOverallHealthStatus } from "./healthStatus";

export async function getHealthSnapshot() {
  const mongo = getMongoHealth();
  const queue = await documentQueue.getHealth();

  return {
    status: resolveOverallHealthStatus(mongo.status, queue.status),
    mongo,
    redis: queue.redis,
    queue,
    circuitBreaker: getDocuSignCircuitBreakerState()
  };
}
