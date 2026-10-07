import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

async function call<T>(name:string,data:unknown={}):Promise<T>{
  const result=await httpsCallable(functions,name)(data);
  return result.data as T;
}
export interface PlatformFeature { id:string; key:string; name:string; description?:string; icon?:string; kind:'webview'|'service'|'screen'; serviceKey?:string|null; screenKey?:string|null; webviewKey?:string|null; enabled:boolean; home:boolean; roles:string[]; countries:string[]; sortOrder:number; archived?:boolean; }
export interface CountryRow { id:string; code:string; name:string; flag?:string; dial?:string; currency?:string; enabled:boolean; archived?:boolean; sortOrder:number; }
export interface OperatorRow { id:string; name:string; country:string; logo?:string; enabled:boolean; recharge:boolean; internet:boolean; offerPacks:boolean; entertainment:boolean; sortOrder:number; archived?:boolean; }
export interface UserLookup { uid:string; name:string; phone:string; role:string; userId:string; }
export interface CatalogAdmin { features:PlatformFeature[]; countries:CountryRow[]; operators:OperatorRow[]; webviews:Array<Record<string,any>>; ads:Record<string,boolean> & { placementControls?: any }; }

export const listCatalog=()=>call<CatalogAdmin>('listPlatformCatalogAdmin');
export const saveFeature=(data:Partial<PlatformFeature>)=>call<{ok:boolean,id:string}>('savePlatformFeature',data);
export const deleteFeature=(id:string)=>call<{ok:boolean}>('deletePlatformFeature',{id});
export const saveCountry=(data:Partial<CountryRow>)=>call<{ok:boolean,id:string}>('saveCountryCatalog',data);
export const deleteCountry=(id:string)=>call<{ok:boolean}>('deleteCountryCatalog',{id});
export const saveOperator=(data:Partial<OperatorRow>)=>call<{ok:boolean,id:string}>('saveOperatorCatalog',data);
export const deleteOperator=(id:string)=>call<{ok:boolean}>('deleteOperatorCatalog',{id});
export const targetWebview=(data:{key:string;roles:string[];countries:string[];users?:string[]})=>call<{ok:boolean}>('updateWebviewTargeting',data);
export const updateAds=(changes:Record<string,boolean>)=>call<{ok:boolean}>('updateGoogleAdsControls',{changes});
export const updateAdPlacementControls=(changes:any)=>call<{ok:boolean}>('updateAdPlacementControls',{changes});

export async function searchUsers(query:string):Promise<UserLookup[]>{
  const result=await call<{results?:UserLookup[]}>('searchUsers',{query});
  return Array.isArray(result.results) ? result.results : [];
}

export const getGridManagementAdmin = () => call('getGridManagementAdmin', {});
export const updateGridManagement = (data: any) => call('updateGridManagement', data);

export const saveWebviewPage = (data: any) => call('saveWebviewPage', data);
export const deleteWebviewPage = (key: string) => call('deleteWebviewPage', { key });

export const purgeFlaggedTestTransactions = (confirmation: string) => call<{ deleted: number }>('purgeFlaggedTestTransactions', { confirmation });
