import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@fakhri/prisma';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateAdminUserDto, UpdateAdminUserDto } from './auth.dto';
import { PasswordService } from './password.service';
import { Principal } from './principal';
import { TokenService } from './token.service';

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Admin account management (REQ-29). SUPER_ADMIN only; every change is audited. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateAdminUserDto): Promise<AdminUserView> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);
    const existing = await this.prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw conflict('Email is already in use');

    const created = await this.prisma.adminUser
      .create({ data: { name: dto.name, email, passwordHash, role: dto.role } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw conflict('Email is already in use');
        }
        throw error;
      });
    await this.audit.log({
      actorType: 'ADMIN',
      action: 'auth.admin_user.create',
      entityType: 'AdminUser',
      entityId: created.id,
      after: { email, role: dto.role },
    });
    return serialize(created);
  }

  async list(query: PaginationQueryDto) {
    const { skip, take } = normalizePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.adminUser.count(),
      this.prisma.adminUser.findMany({ orderBy: { email: 'asc' }, skip, take }),
    ]);
    return { items: rows.map(serialize), meta: buildMeta(total, skip, take) };
  }

  async get(id: string): Promise<AdminUserView> {
    return serialize(await this.require(id));
  }

  async update(id: string, dto: UpdateAdminUserDto, actor: Principal): Promise<AdminUserView> {
    const existing = await this.require(id);
    const losingSuperAdmin =
      existing.role === UserRole.SUPER_ADMIN &&
      ((dto.role !== undefined && dto.role !== UserRole.SUPER_ADMIN) || dto.isActive === false);
    if (losingSuperAdmin) await this.assertAnotherSuperAdminRemains(id);
    if (dto.isActive === false && id === actor.id) {
      throw conflict('You cannot deactivate your own account');
    }

    const data: Prisma.AdminUserUpdateInput = {
      name: dto.name,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password !== undefined) data.passwordHash = await this.passwords.hash(dto.password);

    const updated = await this.prisma.adminUser.update({ where: { id }, data });
    // A new password or a disabled account must not leave live sessions behind.
    if (dto.password !== undefined || dto.isActive === false) {
      await this.tokens.revokeAllFor({ type: 'ADMIN', id });
    }
    await this.audit.log({
      actorType: 'ADMIN',
      action: 'auth.admin_user.update',
      entityType: 'AdminUser',
      entityId: id,
      before: serialize(existing),
      after: { name: dto.name, role: dto.role, isActive: dto.isActive, passwordChanged: dto.password !== undefined },
    });
    return serialize(updated);
  }

  async remove(id: string, actor: Principal): Promise<{ id: string }> {
    const existing = await this.require(id);
    if (id === actor.id) throw conflict('You cannot delete your own account');
    if (existing.role === UserRole.SUPER_ADMIN) await this.assertAnotherSuperAdminRemains(id);

    await this.prisma.adminUser.delete({ where: { id } });
    await this.audit.log({
      actorType: 'ADMIN',
      action: 'auth.admin_user.delete',
      entityType: 'AdminUser',
      entityId: id,
      before: serialize(existing),
    });
    return { id };
  }

  private async require(id: string) {
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!row) throw notFound('Admin user');
    return row;
  }

  /** The system must always keep one way in. */
  private async assertAnotherSuperAdminRemains(exceptId: string): Promise<void> {
    const others = await this.prisma.adminUser.count({
      where: { role: UserRole.SUPER_ADMIN, isActive: true, NOT: { id: exceptId } },
    });
    if (others === 0) throw conflict('The last active super admin cannot be removed or demoted');
  }
}

function serialize(row: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminUserView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
