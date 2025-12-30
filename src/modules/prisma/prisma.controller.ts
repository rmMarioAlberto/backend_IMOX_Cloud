import { Controller } from '@nestjs/common';
import { PrismaMysqlService } from './prisma-mysql.service';
import { PrismaMongoService } from './prisma-mongo.service';

@Controller('prisma')
export class PrismaController {
  constructor(
    private readonly prismaService: PrismaMysqlService,
    private readonly prismaMongoService: PrismaMongoService,
  ) {}
}
