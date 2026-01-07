import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { ConflictException } from '@nestjs/common';

// iniciar mock de bcrypt para que no genere error de importación en el servicio
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

// iniciar mock de prisma para que no genere error de importación en el servicio
const mockPrismaService = {
  users: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UserService - Register', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaMysqlService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('debería crear un nuevo usuario con contraseña hasheada', async () => {
      const registerDto = {
        name: 'Test User',
        email: 'test@imox.cloud',
        password: 'password123',
      };

      const createdUser = {
        id: 1,
        name: 'Test User',
        email: 'test@imox.cloud',
        password: 'hashed_password',
        role: 1,
        status: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock: email no existe
      mockPrismaService.users.findUnique.mockResolvedValue(null);
      // Mock: hash de bcrypt
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      // Mock: creación exitosa
      mockPrismaService.users.create.mockResolvedValue(createdUser);

      const result = await service.register(registerDto);

      expect(mockPrismaService.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@imox.cloud' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrismaService.users.create).toHaveBeenCalledWith({
        data: {
          name: 'Test User',
          email: 'test@imox.cloud',
          password: 'hashed_password',
          role: 1,
          status: 1,
        },
      });
      // RegisterResponseDto solo expone 'id' debido a @Exclude/@Expose
      expect(result).toHaveProperty('id', 1);
    });

    it('debería lanzar ConflictException si el email ya existe', async () => {
      const registerDto = {
        name: 'Test User',
        email: 'existing@imox.cloud',
        password: 'password123',
      };

      // Mock: email ya existe en base de datos
      mockPrismaService.users.findUnique.mockResolvedValue({
        id: 1,
        email: 'existing@imox.cloud',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'El correo ya está registrado',
      );

      // Verificar que NO intentó crear el usuario
      expect(mockPrismaService.users.create).not.toHaveBeenCalled();
    });
  });
});
