import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/types/request.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('procedures')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ProceduresController {
  constructor(private readonly svc: ProceduresService) {}

  @Post()     create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateProcedureDto) { return this.svc.create(u.companyId, dto); }
  @Get()      findAll(@CurrentUser() u: AuthenticatedUser) { return this.svc.findAll(u.companyId); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<CreateProcedureDto>) { return this.svc.update(id, dto); }
  @Delete(':id') delete(@Param('id') id: string) { return this.svc.delete(id); }
}
