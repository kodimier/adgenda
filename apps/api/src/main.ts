/**
 * Adgenda API
 * Copyright (C) 2026 Victor Paschoal (kodimier)
 * Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import "reflect-metadata";
import "dotenv/config";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function corsOrigins(): string | string[] {
  const raw = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const list = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return list.length <= 1 ? (list[0] ?? "http://localhost:5173") : list;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigins(), credentials: true });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
