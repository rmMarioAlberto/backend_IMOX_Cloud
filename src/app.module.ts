import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { IotModule } from './modules/iot/iot.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { AllExceptionsFilter } from './common/filters/exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { RoleThrottlerGuard } from './common/guards/role-throttler.guard';
import { ThrottlerModule } from '@nestjs/throttler';
import { getThrottlerConfig } from './config/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    DatabaseModule,
    IotModule,
    MqttModule,
    TelemetryModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getThrottlerConfig(configService),
    }),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
