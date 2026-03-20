import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller';
import { OtaService } from './ota.service';
import { DatabaseModule } from '../database/database.module';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [DatabaseModule, MqttModule],
  controllers: [OtaController],
  providers: [OtaService],
  exports: [OtaService],
})
export class OtaModule {}
