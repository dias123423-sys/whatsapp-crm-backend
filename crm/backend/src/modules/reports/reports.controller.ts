import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/types/request.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { format, startOfMonth } from 'date-fns';

@Controller('reports')
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('stats')
  getStats(
    @CurrentUser() u: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const from = dateFrom ? new Date(dateFrom) : startOfMonth(new Date());
    const to   = dateTo   ? new Date(dateTo)   : new Date();
    return this.reportsService.generateReport(u.companyId, from, to);
  }

  @Get('export')
  async exportExcel(
    @CurrentUser() u: AuthenticatedUser,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response,
  ) {
    const buffer   = await this.reportsService.buildExcel(u.companyId, new Date(dateFrom), new Date(dateTo));
    const filename = `crm_report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
