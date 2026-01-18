import { Module, Global } from '@nestjs/common';
import { MariaDbService } from './mariadb.service';
import { InfluxDbService } from './influxdb.service';
import { RedisService } from './redis.service';
import { AuthRedisService } from './auth/auth-redis.service';
import { TelemetryInfluxService } from './telemetry/telemetry-influx.service';
import { TelemetryRedisService } from './telemetry/telemetry-redis.service';

@Global()
@Module({
  providers: [
    MariaDbService,
    InfluxDbService,
    RedisService,
    AuthRedisService,
    TelemetryRedisService,
    TelemetryInfluxService,
  ],
  exports: [
    MariaDbService,
    InfluxDbService,
    RedisService,
    AuthRedisService,
    TelemetryRedisService,
    TelemetryInfluxService,
  ],
})
export class DatabaseModule {}
