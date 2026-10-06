import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const call = (name, data) => httpsCallable(functions, name)(data).then(r => r.data);

export const getPlatformCatalog = () => call('getPlatformCatalog', {});
export const listPlatformCatalogAdmin = () => call('listPlatformCatalogAdmin', {});
export const savePlatformFeature = (data) => call('savePlatformFeature', data);
export const deletePlatformFeature = (id) => call('deletePlatformFeature', { id });
export const saveCountryCatalog = (data) => call('saveCountryCatalog', data);
export const deleteCountryCatalog = (id) => call('deleteCountryCatalog', { id });
export const saveOperatorCatalog = (data) => call('saveOperatorCatalog', data);
export const deleteOperatorCatalog = (id) => call('deleteOperatorCatalog', { id });
export const updateWebviewTargeting = (data) => call('updateWebviewTargeting', data);
export const updateGoogleAdsControls = (changes) => call('updateGoogleAdsControls', { changes });

export function resolveDynamicFeatures(features, viewer) {
  const v = viewer || {};
  return (features || []).filter((f) => {
    if (f.enabled === false || f.archived === true) return false;
    if (Array.isArray(f.roles) && f.roles.length && !f.roles.includes(v.role)) return false;
    if (Array.isArray(f.countries) && f.countries.length && !f.countries.includes(v.country)) return false;
    if (Array.isArray(f.users) && f.users.length && !f.users.includes(v.uid)) return false;
    return true;
  }).sort((a,b) => (Number(a.sortOrder)||999)-(Number(b.sortOrder)||999));
}

export function webviewAllowed(page, viewer) {
  if (!page || page.active === false) return false;
  const v = viewer || {};
  if (Array.isArray(page.roles) && page.roles.length && !page.roles.includes(v.role)) return false;
  if (Array.isArray(page.countries) && page.countries.length && !page.countries.includes(v.country)) return false;
  if (Array.isArray(page.users) && page.users.length && !page.users.includes(v.uid)) return false;
  return true;
}
