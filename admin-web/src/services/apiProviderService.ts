import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

const listFn = httpsCallable(functions, 'listApiProviders');
const saveFn = httpsCallable(functions, 'saveApiProvider');
const deleteFn = httpsCallable(functions, 'deleteApiProvider');
const testFn = httpsCallable(functions, 'testApiProvider');
const catalogFn = httpsCallable(functions, 'getIimmpactCatalog');
const optionsFn = httpsCallable(functions, 'getIimmpactOptions');
const fullCostCatalogFn = httpsCallable(functions, 'getIimmpactFullCatalogForSuperadmin');

export type ApiProvider = Record<string, any> & {
  id?: string;
  name?: string;
  service?: string;
  services?: string[];
  country?: string;
  countries?: string[];
  excludedCountries?: string[];
  catalogDynamicProductDiscovery?: boolean;
  baseUrl?: string;
  endpointPath?: string;
  method?: string;
  authType?: string;
  active?: boolean;
  priority?: number;
  timeoutMs?: number;
  hasApiKey?: boolean;
  hasSecretKey?: boolean;
  hasUsername?: boolean;
  hasPassword?: boolean;
  catalogPreset?: string;
  catalogPath?: string;
  catalogListPath?: string;
  catalogFieldId?: string;
  catalogPerAccount?: boolean | string;
};

export const API_SERVICES = [
  'Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train',
  'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment',
  'Recharge PIN',
];

export const COUNTRIES = [
  ['ALL','All countries'],  ['MY','Malaysia'], ['BD','Bangladesh'], ['SG','Singapore'], ['ID','Indonesia'],
  ['IN','India'], ['PH','Philippines'], ['NP','Nepal'], ['PK','Pakistan'],
  ['MM','Myanmar'], ['KH','Cambodia'], ['TH','Thailand'],
] as const;

export async function listApiProviders(): Promise<ApiProvider[]> {
  const res = await listFn({});
  return (res.data as any)?.providers || (res.data as any) || [];
}

export async function saveApiProvider(provider: ApiProvider): Promise<any> {
  return (await saveFn(provider)).data;
}

export async function deleteApiProvider(id: string): Promise<any> {
  return (await deleteFn({ id })).data;
}

export async function testApiProvider(id: string): Promise<any> {
  return (await testFn({ id })).data;
}

export async function getIimmpactCatalog(id: string, productCode = '', includeInactive = false): Promise<any> {
  return (await catalogFn({ id, productCode, includeInactive })).data || {};
}

export async function getIimmpactFullCatalogForSuperadmin(country = 'MY'): Promise<any> {
  return (await fullCostCatalogFn({ country })).data || {};
}

export async function getIimmpactOptions(args: {
  providerId: string;
  productCode: string;
  fieldId: string;
  accountNumber?: string;
  billerCode?: string;
  page?: number;
  limit?: number;
}): Promise<any> {
  return (await optionsFn(args)).data || {};
}
