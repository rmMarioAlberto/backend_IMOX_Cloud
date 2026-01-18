import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  RegisterUserDto,
  RegisterResponseDto,
  ResponseGetProfileDto,
  EditProfileDto,
} from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { MariaDbService } from '../database/mariadb.service';
import { plainToInstance } from 'class-transformer';
import { hash } from 'bcrypt';
import { responseMessage } from 'src/common/utils/dto/utils.dto';

@Injectable()
export class UserService {
  constructor(private readonly mariaDbService: MariaDbService) {}

  async register(
    registerUserDto: RegisterUserDto,
  ): Promise<RegisterResponseDto> {
    const { name, email, password } = registerUserDto;

    const checkUser = await this.mariaDbService.users.findUnique({
      where: {
        email: email,
      },
    });

    if (checkUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    const newUser = await this.mariaDbService.users.create({
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

  async getProfile(user: UserPayloadDto): Promise<ResponseGetProfileDto> {
    const { id } = user;

    const userFound = await this.mariaDbService.users.findUnique({
      where: { id: id, status: 1 },
    });
    if (!userFound) {
      throw new BadRequestException('User not found');
    }
    return plainToInstance(ResponseGetProfileDto, userFound);
  }

  async editProfile(
    dto: EditProfileDto,
    userId: number,
  ): Promise<responseMessage> {
    const { name } = dto;

    await this.mariaDbService.users.update({
      where: { id: userId },
      data: { name },
    });

    return { message: 'user updated' };
  }
}
