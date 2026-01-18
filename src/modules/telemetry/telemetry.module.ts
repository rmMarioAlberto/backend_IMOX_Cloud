import { Module } from '@nestjs/common';
import { TelemetryScheduler } from './telemetry.scheduler';
import { SpikeDetectorService } from './spike-detector.service';
import { RedisService } from '../database/redis.service';
import { MariaDbService } from '../database/mariadb.service';

import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({
  imports: [RedisService, MariaDbService, AuthModule],
  providers: [TelemetryScheduler, SpikeDetectorService, TelemetryGateway],
  exports: [SpikeDetectorService, TelemetryGateway],
})
export class TelemetryModule {}
