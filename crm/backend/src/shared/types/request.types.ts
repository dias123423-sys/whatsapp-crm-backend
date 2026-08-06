import { UserRole } from '../enums';

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  companyId: string;
  operatorId?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  operatorId?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
