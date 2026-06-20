import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { CategoryController } from './../src/category/category.controller';

describe('Marketplace API integration', () => {
  let moduleFixture: TestingModule;
  let categories: CategoryController;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        category: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    categories = moduleFixture.get(CategoryController);
  });

  it('lists categories', async () => {
    await expect(categories.list()).resolves.toEqual([]);
  });

  afterEach(async () => {
    await moduleFixture.close();
  });
});
