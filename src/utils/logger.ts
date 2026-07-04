import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;
export default createLogger as unknown as (name: string) => Logger;

export function createLogger(name: string): Logger {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: true,
        },
      },
    }),
  });
}