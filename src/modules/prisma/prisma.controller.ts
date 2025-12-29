import { Controller } from '@nestjs/common';
import { PrismaPostgresService } from './prisma-postgres.service';
import { PrismaMongoService } from './prisma-mongo.service';

@Controller('prisma')
export class PrismaController {
  constructor(
    private readonly prismaPostgresService: PrismaPostgresService,
    private readonly prismaMongoService: PrismaMongoService,
  ) {}
}
