import { Global, Module } from '@nestjs/common';
import { PrismaPostgresService } from './prisma-postgres.service';
import { PrismaMongoService } from './prisma-mongo.service';

@Global()
@Module({
  providers: [PrismaPostgresService, PrismaMongoService],
  exports: [PrismaPostgresService, PrismaMongoService],
})
export class PrismaModule {}
