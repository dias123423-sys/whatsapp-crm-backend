import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/types/request.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('operators')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOperatorDto) {
    return this.operatorsService.create(user.companyId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.operatorsService.findAll(user.companyId);
  }

  @Get('kpi')
  kpi(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().setDate(1));
    const to   = dateTo   ? new Date(dateTo)   : new Date();
    return this.operatorsService.getKpi(user.companyId, from, to);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operatorsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOperatorDto) {
    return this.operatorsService.update(id, dto);
  }
}
