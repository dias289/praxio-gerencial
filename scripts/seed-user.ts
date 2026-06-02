import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function main() {
  const users = [
    { email: "dias28@gmail.com",     name: "Felipe Dias",    password: "praxio2026" },
    { email: "admin@praxio.com.br",  name: "Admin Praxio",   password: "praxio2026" },
  ];

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, passwordHash },
      create: { email: u.email, name: u.name, passwordHash },
    });
    console.log(`✓ ${user.email} (${user.name})`);
  }

  console.log("\nSenha inicial de todos: praxio2026");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
