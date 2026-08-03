import IORedis from 'ioredis';

// BullMQ requires maxRetriesPerRequest: null on its connection.
export const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
