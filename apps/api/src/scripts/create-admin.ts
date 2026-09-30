/**
 * Creates or updates an admin account. A fresh deployment needs this once,
 * because every /admin route requires an authenticated admin (REQ-29).
 *
 *   npm run admin:create -w apps/api -- --email you@example.com --name "You" --role SUPER_ADMIN
 *
 * The password is read from ADMIN_PASSWORD when set, so it stays out of the
 * process list and shell history; --password is accepted for convenience.
 *
 * The npm script loads apps/api/.env via --env-file-if-exists. In a built image
 * the environment already carries the values:
 *   node dist/scripts/create-admin.js --email ...
 */
import { PrismaClient, UserRole } from '@fakhri/prisma';
import { PasswordService } from '../modules/auth/password.service';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const role = (arg('role') ?? UserRole.SUPER_ADMIN) as UserRole;
  const password = process.env.ADMIN_PASSWORD ?? arg('password');

  if (!email || !password) {
    const missing = [!email && '--email', !password && 'a password'].filter(Boolean);
    throw new Error(
      `Missing ${missing.join(' and ')}.\n` +
        'Usage: ADMIN_PASSWORD=<password> npm run admin:create -w apps/api -- \\\n' +
        '         --email <email> --name <name> [--role SUPER_ADMIN]\n' +
        `Roles: ${Object.values(UserRole).join(', ')}\n` +
        'The password comes from ADMIN_PASSWORD so it stays out of your shell history; --password also works.',
    );
  }
  const name = arg('name') ?? email;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env, or export it.');
  }
  if (!Object.values(UserRole).includes(role)) {
    throw new Error(`Unknown role ${role}. One of: ${Object.values(UserRole).join(', ')}`);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await new PasswordService().hash(password);
    const admin = await prisma.adminUser.upsert({
      where: { email },
      create: { email, name, role, passwordHash },
      update: { name, role, passwordHash, isActive: true },
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
