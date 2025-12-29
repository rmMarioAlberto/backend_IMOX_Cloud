import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prismaMongo';

@Injectable()
export class PrismaMongoService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaMongoService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado a MongoDB correctamente');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Desconectado de MongoDB');
  }
}
