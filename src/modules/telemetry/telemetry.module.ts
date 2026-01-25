import { Module } from '@nestjs/common';
import { TelemetryScheduler } from './telemetry.scheduler';
import { SpikeDetectorService } from './spike-detector.service';
import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({
  imports: [AuthModule],
  providers: [TelemetryScheduler, SpikeDetectorService, TelemetryGateway],
  exports: [SpikeDetectorService, TelemetryGateway],
})
export class TelemetryModule {}
