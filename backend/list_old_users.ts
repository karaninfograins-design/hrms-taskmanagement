import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./src/generated/prisma/client.js";

async function main() {
  const adapter = new PrismaMariaDb({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "Password@123",
    database: "hrms_db",
    allowPublicKeyRetrieval: true,
  });
  const p = new PrismaClient({ adapter });
  const users = await p.user.findMany({ select: { id: true, name: true, email: true } });
  console.log("USERS IN OLD hrms_db (" + users.length + "):");
  users.forEach(u => console.log(u.id, u.name, u.email));
  await p.$disconnect();
}
main();
