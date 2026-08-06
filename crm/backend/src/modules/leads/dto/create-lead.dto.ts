export interface CreateLeadDto {
  companyId: string;
  phone: string;
  waName?: string;
  firstMessage: string;
  waAccountId: string;
  campaignId?: string;
  adId?: string;
}
