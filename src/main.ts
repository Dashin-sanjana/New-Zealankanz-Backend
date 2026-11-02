import { createApplication } from './create-app';

async function bootstrap() {
  const app = await createApplication();
  const port = process.env.PORT ?? 3000;
  await app.listen(port, process.env.HOST ?? '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Swagger documentation is available at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
