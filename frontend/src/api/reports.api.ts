import { api } from '@/lib/api';
import type { Report, ReportFilters } from '@/types';

export const reportsApi = {
  // Get report with filters
  getReport: (filters: ReportFilters) => 
    api.get<Report>('/reports', { params: filters }),
  
  // Get night report (19:00 - 09:00)
  getNightReport: (date?: string) => 
    api.get<Report>('/reports/night', { params: { date } }),
  
  // Get day report (00:00 - 20:00)
  getDayReport: (date?: string) => 
    api.get<Report>('/reports/day', { params: { date } }),
  
  // Download Excel
  downloadExcel: (filters: ReportFilters) => 
    api.get('/reports/excel', { 
      params: filters,
      responseType: 'blob',
    }),
  
  // Download leads Excel
  downloadLeadsExcel: (filters?: Record<string, any>) => 
    api.get('/leads/excel', { 
      params: filters,
      responseType: 'blob',
    }),
};
