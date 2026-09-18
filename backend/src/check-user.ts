import { prisma } from "./config/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: { select: { name: true } } }
  });
  console.log("USERS:", JSON.stringify(users, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
