/**
 * Creates or updates an admin account. A fresh deployment needs this once,
 * because every /admin route requires an authenticated admin (REQ-29).
 *
 *   npm run admin:create -w apps/api -- --email you@example.com --name "You" --role SUPER_ADMIN
 *
 * The password is read from ADMIN_PASSWORD when set, so it stays out of the
 * process list and shell history; --password is accepted for convenience.
 * In a built image: node dist/scripts/create-admin.js --email ...
 */
import { PrismaClient, UserRole } from '@fakhri/prisma';
import { PasswordService } from '../modules/auth/password.service';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name') ?? email;
  const role = (arg('role') ?? UserRole.SUPER_ADMIN) as UserRole;
  const password = process.env.ADMIN_PASSWORD ?? arg('password');

  if (!email || !password) {
    throw new Error('Usage: --email <email> --name <name> [--role ROLE] (password via ADMIN_PASSWORD or --password)');
  }
  if (!Object.values(UserRole).includes(role)) {
    throw new Error(`Unknown role ${role}. One of: ${Object.values(UserRole).join(', ')}`);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await new PasswordService().hash(password);
    const admin = await prisma.adminUser.upsert({
      where: { email },
      create: { email, name: name!, role, passwordHash },
      update: { name: name!, role, passwordHash, isActive: true },
    });
    // Rotating the password must not leave old sessions alive.
    await prisma.refreshToken.updateMany({
      where: { userId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    process.stdout.write(`admin ${admin.email} (${admin.role}) ready\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
