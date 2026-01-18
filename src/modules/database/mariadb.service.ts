import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prismaMysql';

@Injectable()
export class MariaDbService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MariaDbService.name);

  async onModuleInit() {
    try {
      await this.$connect();

      await this.$queryRaw`SELECT 1`;

      this.logger.log('Conectado a MariaDB correctamente');
    } catch (error) {
      this.logger.error('Error al conectar a MariaDB:', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Desconectado de MariaDB');
    } catch (error) {
      this.logger.error('Error al desconectar de MariaDB:', error.message);
    }
  }
}
