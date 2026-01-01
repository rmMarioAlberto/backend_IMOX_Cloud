import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [RedisModule, PrismaModule, TelemetryModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
