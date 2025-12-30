import { Injectable, ConflictException } from '@nestjs/common';
import { RegisterUserDto, RegisterResponseDto } from './dto/user.dto';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { plainToInstance } from 'class-transformer';
import { hash } from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaMysqlService) {}

  async register(
    registerUserDto: RegisterUserDto,
  ): Promise<RegisterResponseDto> {
    const { name, email, password } = registerUserDto;

    const checkUser = await this.prismaService.users.findUnique({
      where: {
        email: email,
      },
    });

    if (checkUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    const newUser = await this.prismaService.users.create({
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
