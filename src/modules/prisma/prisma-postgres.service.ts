import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prismaPostgres';
@Injectable()
export class PrismaPostgresService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaPostgresService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL correctamente');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Desconectado de PostgreSQL');
  }
}
