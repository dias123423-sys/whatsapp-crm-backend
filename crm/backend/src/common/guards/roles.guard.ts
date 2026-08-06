import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { AuthenticatedUser } from '../../shared/types/request.types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 4,
  [UserRole.ADMIN]:       3,
  [UserRole.MANAGER]:     2,
  [UserRole.OPERATOR]:    1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const userLevel  = ROLE_HIERARCHY[user.role] ?? 0;
    const minRequired = Math.min(...required.map((r) => ROLE_HIERARCHY[r]));

    if (userLevel < minRequired) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
