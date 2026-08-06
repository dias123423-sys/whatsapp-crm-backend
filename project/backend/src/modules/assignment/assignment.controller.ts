import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AssignmentService } from './assignment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('assignment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('assignment')
export class AssignmentController {
  constructor(private assignmentService: AssignmentService) {}

  @Get('config')
  getConfig() {
    return this.assignmentService.getConfig();
  }

  @Put('strategy')
  updateStrategy(@Body('strategy') strategy: 'ROUND_ROBIN' | 'LEAST_BUSY' | 'MANUAL') {
    return this.assignmentService.updateStrategy(strategy);
  }
}
