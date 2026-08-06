import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Post('lead/:leadId')
  logCall(
    @Param('leadId') leadId: string,
    @Body() body: { result?: string; notes?: string; duration?: number },
  ) {
    return this.callsService.logCall(leadId, body);
  }

  @Get('lead/:leadId')
  getByLead(@Param('leadId') leadId: string) {
    return this.callsService.getCallsByLead(leadId);
  }
}
