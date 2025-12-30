import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prismaMysql';

@Injectable()
export class PrismaMysqlService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaMysqlService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado a MySQL correctamente');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Desconectado de MySQL');
  }
}
