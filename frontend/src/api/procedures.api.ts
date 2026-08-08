import { api } from '@/lib/api';
import type { Procedure, CreateProcedureDto } from '@/types';

export const proceduresApi = {
  getAll: () => api.get<Procedure[]>('/procedures'),
  
  getOne: (id: string) => api.get<Procedure>(`/procedures/${id}`),
  
  create: (data: CreateProcedureDto) => 
    api.post<Procedure>('/procedures', data),
  
  update: (id: string, data: Partial<CreateProcedureDto>) => 
    api.patch<Procedure>(`/procedures/${id}`, data),
  
  delete: (id: string) => api.delete(`/procedures/${id}`),
  
  toggleActive: (id: string) => 
    api.patch<Procedure>(`/procedures/${id}/toggle-active`),
};
