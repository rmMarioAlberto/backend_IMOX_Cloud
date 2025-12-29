import { Injectable, ConflictException } from '@nestjs/common';
import { RegisterUserDto, RegisterResponseDto } from './dto/user.dto';
import { PrismaPostgresService } from '../prisma/prisma-postgres.service';
import { plainToInstance } from 'class-transformer';
import { hash } from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prismaPostgresService: PrismaPostgresService) {}

  async register(
    registerUserDto: RegisterUserDto,
  ): Promise<RegisterResponseDto> {
    const { name, email, password } = registerUserDto;

    const checkUser = await this.prismaPostgresService.users.findUnique({
      where: {
        email,
      },
    });

    if (checkUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    const newUser = await this.prismaPostgresService.users.create({
      data: {
        name,
        email,
        password: await hash(password, 10),
        role: 1,
        status: 1,
      },
    });

    return plainToInstance(RegisterResponseDto, newUser);
  }
}
