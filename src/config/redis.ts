import { env } from "./env";

export function getRedisConfig() {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD
  };
}
