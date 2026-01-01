import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  RegisterUserDto,
  RegisterResponseDto,
  responseGetProfileDto,
  editProfileDto,
} from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { plainToInstance } from 'class-transformer';
import { hash } from 'bcrypt';
import { responseMessage } from 'src/common/utils/dto/utils.dto';

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

  async getProfile(user: UserPayloadDto): Promise<responseGetProfileDto> {
    const { id } = user;

    const userFound = await this.prismaService.users.findUnique({
      where: { id: id, status: 1 },
    });
    if (!userFound) {
      throw new BadRequestException('User not found');
    }
    return plainToInstance(responseGetProfileDto, userFound);
  }

  async editProfile(
    dto: editProfileDto,
    userId: number,
  ): Promise<responseMessage> {
    const { name } = dto;

    await this.prismaService.users.update({
      where: { id: userId },
      data: { name },
    });

    return { message: 'user updated' };
  }
}
