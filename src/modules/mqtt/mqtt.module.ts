import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { RedisService } from '../database/redis.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [RedisService, MariaDbService, TelemetryModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
