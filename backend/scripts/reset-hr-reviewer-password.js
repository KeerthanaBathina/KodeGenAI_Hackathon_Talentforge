const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  const email = 'hr-reviewer@dev.local';
  const newPassword = 'HrReviewer@123';

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.userCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash },
    create: { userId: user.id, passwordHash },
  });

  console.log(JSON.stringify({ email: user.email, role: user.role, password: newPassword }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
