import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface DetectionResult {
  procedureId: string | null;
  procedureName: string | null;
  confidence: number;
  matched: string | null;
}

@Injectable()
export class ProcedureDetectorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect procedure from incoming WhatsApp message text.
   * Priority:
   *   1. Ad prefill_text exact match → confidence 1.0
   *   2. Campaign → procedure mapping
   *   3. Keyword match from procedures table
   *   4. No match → null
   */
  async detect(
    companyId: string,
    messageText: string,
    campaignId?: string,
    adId?: string,
  ): Promise<DetectionResult> {
    const text = messageText.toLowerCase().trim();

    // ── 1. Ad-level prefill match ─────────────────────────────────────────
    if (adId) {
      const ad = await this.prisma.ad.findUnique({
        where: { id: adId },
        include: {
          campaign: {
            include: { procedures: { include: { procedure: true } } },
          },
        },
      });
      if (ad?.prefillText && text.includes(ad.prefillText.toLowerCase())) {
        const proc = ad.campaign.procedures[0]?.procedure;
        if (proc) {
          return {
            procedureId: proc.id,
            procedureName: proc.name,
            confidence: 1.0,
            matched: ad.prefillText,
          };
        }
      }
    }

    // ── 2. Campaign-level procedure (if campaign has exactly one) ─────────
    if (campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { procedures: { include: { procedure: true } } },
      });
      if (campaign?.procedures.length === 1) {
        const proc = campaign.procedures[0].procedure;
        return {
          procedureId: proc.id,
          procedureName: proc.name,
          confidence: 0.95,
          matched: `campaign:${campaign.slug}`,
        };
      }
    }

    // ── 3. Keyword matching ───────────────────────────────────────────────
    const procedures = await this.prisma.procedure.findMany({
      where: { companyId, isActive: true },
    });

    let bestMatch: DetectionResult = {
      procedureId: null,
      procedureName: null,
      confidence: 0,
      matched: null,
    };

    for (const proc of procedures) {
      // Check procedure name itself
      if (text.includes(proc.name.toLowerCase())) {
        if (0.9 > bestMatch.confidence) {
          bestMatch = {
            procedureId: proc.id,
            procedureName: proc.name,
            confidence: 0.9,
            matched: proc.name,
          };
        }
      }

      // Check keywords array
      for (const kw of proc.keywords) {
        const kwLower = kw.toLowerCase();
        if (text.includes(kwLower)) {
          const confidence = kwLower.length > 5 ? 0.85 : 0.7;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              procedureId: proc.id,
              procedureName: proc.name,
              confidence,
              matched: kw,
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /** Extract and normalise phone from WhatsApp JID (77011234567@s.whatsapp.net) */
  static normalisePhone(jid: string): string {
    const num = jid.split('@')[0];
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
    if (digits.length === 10) return `+7${digits}`;
    return `+${digits}`;
  }
}
