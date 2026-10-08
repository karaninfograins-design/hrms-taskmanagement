import { prisma } from "./config/prisma.js";

async function main() {
  await prisma.message.updateMany({ data: { attachmentUrl: null } });
  console.log("Database test attachments cleaned successfully!");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
