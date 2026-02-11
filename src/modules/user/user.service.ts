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

@Injectable()
export class UserService {
  constructor(private readonly mariaDbService: MariaDbService) {}

  /**
   * Registrar un nuevo usuario
   * @param registerUserDto
   * @returns Promise<void>
   */
  async register(registerUserDto: RegisterUserDto): Promise<void> {
    const { name, email, password } = registerUserDto;

    const checkUser = await this.mariaDbService.users.findUnique({
      where: {
        email: email,
      },
    });

    if (checkUser) {
      throw new ConflictException('El correo ya está registrado');
    }

    await this.mariaDbService.users.create({
      data: {
        name,
        email,
        password: await hash(password, 10),
        role: 1,
        status: 1,
      },
    });
  }

  /**
   * Obtener perfil del usuario
   * @param user
   * @returns Promise<ResponseGetProfileDto>
   */
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

  /**
   * Editar perfil del usuario
   * @param dto
   * @param userId
   * @returns Promise<void>
   */
  async editProfile(dto: EditProfileDto, userId: number): Promise<void> {
    const { name } = dto;

    await this.mariaDbService.users.update({
      where: { id: userId },
      data: { name },
    });
  }
}
