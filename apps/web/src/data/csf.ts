import api from '../lib/api';
import type { CSF } from '../types';

export async function getCSF(userId: string, credentialId: string, rfc: string): Promise<CSF> {
  const { data } = await api.post('/skills/generateCSF/run', {
    userId,
    credentialId,
    rfc,
    input: {},
  });
  return data.result.csf as CSF;
}
