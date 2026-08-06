import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../shared/types/request.types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('campaigns')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Post()   create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateCampaignDto) { return this.svc.create(u.companyId, dto); }
  @Get()    findAll(@CurrentUser() u: AuthenticatedUser) { return this.svc.findAll(u.companyId); }
  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.svc.update(id, dto); }
  @Delete(':id') delete(@Param('id') id: string) { return this.svc.delete(id); }
}
