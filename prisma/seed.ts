import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await hash("admin123", 12);
  const salesPassword = await hash("sales123", 12);

  await prisma.user.upsert({
    where: { loginId: "admin" },
    update: {},
    create: {
      loginId: "admin",
      passwordHash: adminPassword,
      name: "管理者",
      role: "admin",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { loginId: "sales01" },
    update: {},
    create: {
      loginId: "sales01",
      passwordHash: salesPassword,
      name: "営業太郎",
      role: "sales",
      isActive: true,
    },
  });

  console.log("シードデータを投入しました:");
  console.log("  admin / admin123 (管理者)");
  console.log("  sales01 / sales123 (営業)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
