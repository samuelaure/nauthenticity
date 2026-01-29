import { PrismaClient } from './src/generated/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Fixing orphaned accounts...');
  const users = await prisma.post.findMany({
    select: { username: true },
    distinct: ['username'],
    where: { username: { not: null } },
  });

  for (const u of users) {
    if (u.username) {
      await prisma.account.upsert({
        where: { username: u.username },
        update: {},
        create: {
          username: u.username,
          lastScrapedAt: new Date(),
        },
      });
      console.log(`Ensured account for ${u.username}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
