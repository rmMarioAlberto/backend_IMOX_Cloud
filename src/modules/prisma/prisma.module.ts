import { Global, Module } from '@nestjs/common';
import { PrismaMysqlService } from './prisma-mysql.service';
import { PrismaMongoService } from './prisma-mongo.service';

@Global()
@Module({
  providers: [PrismaMysqlService, PrismaMongoService],
  exports: [PrismaMysqlService, PrismaMongoService],
})
export class PrismaModule {}
