import { Test, TestingModule } from '@nestjs/testing';
import { MariaDbService } from './mariadb.service';

describe('MariaDbService', () => {
  let service: MariaDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MariaDbService],
    }).compile();

    service = module.get<MariaDbService>(MariaDbService);
    
    // Mapeamos los métodos del PrismaClient para no ejecutar operaciones reales en la BD
    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
    service.$queryRaw = jest.fn().mockResolvedValue([1]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to the database successfully and run test query', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.$connect).toHaveBeenCalled();
      expect(service.$queryRaw).toHaveBeenCalled();
    });

    it('should throw an error if connection fails', async () => {
      const error = new Error('Connection failed');
      service.$connect = jest.fn().mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow(error);
      expect(service.$connect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from the database successfully', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(service.$disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      const error = new Error('Disconnect failed');
      service.$disconnect = jest.fn().mockRejectedValue(error);

      // No debe lanzar el error ya que lo envuelve en un try/catch y solo hace login
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(service.$disconnect).toHaveBeenCalled();
    });
  });
});
