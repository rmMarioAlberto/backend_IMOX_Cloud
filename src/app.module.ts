import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { UserModule } from './modules/user/user.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './modules/redis/redis.module';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [UserModule, AuthModule, PrismaModule, RedisModule, MailModule],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*'); // Aplicar a todas las rutas
  }
}
