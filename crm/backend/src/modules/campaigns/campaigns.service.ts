import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCampaignDto) {
    return this.prisma.campaign.create({
      data: {
        companyId,
        name: dto.name,
        slug: dto.slug,
        source: dto.source ?? 'facebook',
        waAccountId: dto.waAccountId,
        branchId: dto.branchId,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        assignAlgo: dto.assignAlgo ?? 'ROUND_ROBIN',
        procedures: dto.procedureIds?.length
          ? { create: dto.procedureIds.map((id) => ({ procedureId: id })) }
          : undefined,
      },
      include: { procedures: { include: { procedure: true } }, branch: true },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.campaign.findMany({
      where: { companyId },
      include: {
        procedures: { include: { procedure: true } },
        branch: { select: { id: true, name: true } },
        ads: true,
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        procedures: { include: { procedure: true } },
        ads: true,
        branch: true,
        _count: { select: { leads: true } },
      },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const { procedureIds, ...rest } = dto;
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...rest,
        ...(procedureIds
          ? {
              procedures: {
                deleteMany: {},
                create: procedureIds.map((pid) => ({ procedureId: pid })),
              },
            }
          : {}),
      },
      include: { procedures: { include: { procedure: true } } },
    });
  }

  async delete(id: string) {
    return this.prisma.campaign.delete({ where: { id } });
  }
}
