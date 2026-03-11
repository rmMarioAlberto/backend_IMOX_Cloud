import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { DatabaseModule } from '../database/database.module';
import { IotModule } from '../iot/iot.module';

@Module({
  imports: [DatabaseModule, IotModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
