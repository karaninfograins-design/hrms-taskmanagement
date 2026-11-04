import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";

async function resetSuperAdminPassword() {
  const email = process.env.SUPERADMIN_EMAIL || "superadmin@infograins.com";
  const newPassword = process.env.NEW_PASSWORD || "Securepassword";

  console.log(`Resetting password for ${email}...`);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`Successfully updated password for ${user.email} (ID: ${user.id})`);
}

resetSuperAdminPassword()
  .catch((err) => {
    console.error("Error resetting password:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

