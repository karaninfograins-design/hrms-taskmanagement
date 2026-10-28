import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";

const dbHost = process.env.DB_HOST;
if (!dbHost) {
  throw new Error("DB_HOST must be configured in the backend environment");
}

const adapter = new PrismaMariaDb({
  host: dbHost,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Password@123",
  database: process.env.DB_NAME || "hrms_db",
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 25,
  allowPublicKeyRetrieval:
    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL?.toLowerCase() === "true",
});

export const prisma = new PrismaClient({
  adapter,
});