import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { CreateProcedureDto, UpdateProcedureDto } from './dto/procedure.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Procedures')
@Controller('procedures')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create procedure (Admin only)' })
  @ApiResponse({ status: 201, description: 'Procedure created successfully' })
  @ApiResponse({ status: 409, description: 'Procedure already exists' })
  create(@Body() createProcedureDto: CreateProcedureDto) {
    return this.proceduresService.create(createProcedureDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all procedures' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Procedures retrieved successfully' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.proceduresService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get procedure by ID' })
  @ApiResponse({ status: 200, description: 'Procedure retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  findOne(@Param('id') id: string) {
    return this.proceduresService.findOne(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get procedure statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  getStats(@Param('id') id: string) {
    return this.proceduresService.getStats(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update procedure (Admin only)' })
  @ApiResponse({ status: 200, description: 'Procedure updated successfully' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  update(@Param('id') id: string, @Body() updateProcedureDto: UpdateProcedureDto) {
    return this.proceduresService.update(id, updateProcedureDto);
  }

  @Patch(':id/toggle-active')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Toggle procedure active status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Status toggled successfully' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  toggleActive(@Param('id') id: string) {
    return this.proceduresService.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete procedure (Admin only)' })
  @ApiResponse({ status: 200, description: 'Procedure deleted successfully' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete procedure with associated leads' })
  remove(@Param('id') id: string) {
    return this.proceduresService.remove(id);
  }
}
