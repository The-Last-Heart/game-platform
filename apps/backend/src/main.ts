import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import type { AppConfig } from './config/env.validation';
import { validateEnv } from './config/env.validation';
import { createStructuredLogger, writeStructuredFatal } from './config/logging';

/**
 * Load a local .env into process.env without adding a dotenv dependency.
 * Existing process.env values win (same precedence as typical dotenv usage).
 */
function loadLocalEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }
  const text = readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  // Fail before Nest default logging so bootstrap fatals stay structured JSON.
  const earlyConfig = validateEnv(process.env as Record<string, unknown>);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: createStructuredLogger(earlyConfig.LOG_LEVEL, 'Bootstrap'),
  });
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = app.get(ConfigService<AppConfig, true>);
  const logLevel = config.get('LOG_LEVEL', { infer: true });
  const logger = createStructuredLogger(logLevel, 'Bootstrap');
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`Backend listening on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  writeStructuredFatal(error);
  process.exit(1);
});
