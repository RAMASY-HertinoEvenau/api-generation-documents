import { env } from "./env";

export function getRedisConfig() {
  if (env.REDIS_URL) {
    const redisUrl = new URL(env.REDIS_URL);

    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      password: redisUrl.password || undefined,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined
    };
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD
  };
}
