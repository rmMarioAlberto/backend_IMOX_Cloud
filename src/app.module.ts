import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { MailModule } from './modules/mail/mail.module';
// import { IotModule } from './modules/iot/iot.module';
// import { MqttModule } from './modules/mqtt/mqtt.module';
// import { TelemetryModule } from './modules/telemetry/telemetry.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    DatabaseModule,
    MailModule,
    //IotModule,
    //MqttModule,
    //TelemetryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
