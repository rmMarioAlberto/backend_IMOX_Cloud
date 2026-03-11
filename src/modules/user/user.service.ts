import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RegisterUserDto, ResponseGetProfileDto } from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { MariaDbService } from '../database/mariadb.service';
import { plainToInstance } from 'class-transformer';
import { IotService } from "../iot/iot.service";
import { hash } from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly mariaDbService: MariaDbService, private readonly iotService : IotService) {}

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
      throw new BadRequestException('Usuario no encontrado');
    }
    return plainToInstance(ResponseGetProfileDto, userFound);
  }

  /**
   * Eliminar cuenta de usuario
   * @param idUser 
   * @returns Promise<void>
   */
  async deleteAccount(idUser: number): Promise<void> {
    const user = await this.mariaDbService.users.findUnique({
      where: { id: idUser },
    });

    // Validar si el usuario existe
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const iotDevices = await this.mariaDbService.iot.findMany({
      where: { user_id: idUser },
    });

    // Eliminar telemetría en paralelo
    await Promise.all(
      iotDevices.map((iot) => this.iotService.deleteTelemetryData(iot.id)),
    );

    // Desvincular dispositivos del usuario
    await this.mariaDbService.iot.updateMany({
      where: { user_id: idUser },
      data: { user_id: null },
    });

    // Eliminar el usuario en MariaDB
    await this.mariaDbService.users.delete({ where: { id: idUser } });
  }
}
