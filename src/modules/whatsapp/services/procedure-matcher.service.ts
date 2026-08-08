import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class ProcedureMatcherService {
  private readonly logger = new Logger(ProcedureMatcherService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Match procedure from message text using keywords
   * Returns procedure with price or null if not found
   */
  async matchProcedure(messageText: string): Promise<{ id: string; name: string; price: number } | null> {
    if (!messageText || messageText.trim().length === 0) {
      return null;
    }

    const normalizedMessage = messageText.toLowerCase().trim();

    // Get all active procedures with keywords
    const procedures = await this.prisma.procedure.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        nameKz: true,
        price: true,
        keywords: true,
      },
    });

    if (procedures.length === 0) {
      this.logger.warn('No active procedures found in database');
      return null;
    }

    // Try to match keywords
    for (const procedure of procedures) {
      for (const keyword of procedure.keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();

        // Exact match or contains match
        if (
          normalizedMessage.includes(normalizedKeyword) ||
          this.fuzzyMatch(normalizedMessage, normalizedKeyword)
        ) {
          this.logger.log(
            `Procedure matched: ${procedure.name} (keyword: "${keyword}", price: ${procedure.price})`,
          );

          return {
            id: procedure.id,
            name: procedure.name,
            price: procedure.price,
          };
        }
      }
    }

    this.logger.log('No procedure matched from message');
    return null;
  }

  /**
   * Fuzzy match for handling typos and variations
   */
  private fuzzyMatch(text: string, keyword: string): boolean {
    // Remove spaces and special characters for better matching
    const cleanText = text.replace(/[^a-zA-Zа-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ0-9]/g, '');
    const cleanKeyword = keyword.replace(/[^a-zA-Zа-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ0-9]/g, '');

    // Check if keyword is part of any word in text
    return cleanText.includes(cleanKeyword);
  }

  /**
   * Get default procedure if campaign or source mapping exists
   */
  async getDefaultProcedureBySource(source: string, campaignId?: string): Promise<any | null> {
    // This can be extended to support campaign-to-procedure mapping
    // For now, return null and rely on keyword matching only
    
    if (campaignId) {
      // Future: check campaign mapping
      // const mapping = await this.prisma.campaignMapping.findUnique({...})
    }

    return null;
  }

  /**
   * Get all procedure keywords for debugging
   */
  async getAllKeywords(): Promise<{ procedure: string; keywords: string[] }[]> {
    const procedures = await this.prisma.procedure.findMany({
      where: { active: true },
      select: {
        name: true,
        keywords: true,
      },
    });

    return procedures.map((p) => ({
      procedure: p.name,
      keywords: p.keywords,
    }));
  }
}
