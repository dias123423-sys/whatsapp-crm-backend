import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (origin, callback) => {
      // Allow: localhost, Vercel domains, nip.io, any *.vercel.app
      const allowed = [
        'http://localhost:3000',
        'http://localhost:3002',
        process.env.ADMIN_URL,
        process.env.OPERATOR_URL,
      ].filter(Boolean);

      if (
        !origin ||
        allowed.includes(origin) ||
        /\.vercel\.app$/.test(origin) ||
        /\.nip\.io$/.test(origin) ||
        /\.trycloudflare\.com$/.test(origin) ||
        origin === `https://${process.env.API_DOMAIN}`
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for now — tighten in production if needed
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Call Center API')
    .setDescription('Lead Automation System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
}
bootstrap();
