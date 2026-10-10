import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useApp } from '../context/AppContext';
import { FormLabel, FormInput } from '../components/ui';
import PackagePicker from '../components/PackagePicker';
import * as apiProviderService from '../firebase/apiProviderService';

// IIMMPACT's /v2/catalog is shared across service types; the service argument
// selects the provider, not necessarily a product subset. Prefer category-tree
// membership for eSIM and fall back to explicit eSIM product labels only.
function esimProductCodes(catalog) {
 const codes=new Set();
 for(const group of catalog?.tree?.groups||[]) for(const category of group?.categories||[]) {
  const label=`${group?.name||''} ${category?.name||''}`.toLowerCase();
  if(/e\s*-?\s*sim|esim|travel connectivity/i.test(label)) for(const code of category?.product_codes||[]) codes.add(String(code));
 }
 return codes;
}
function isExplicitEsim(p) { return /e\s*-?\s*sim|esim/i.test(`${p?.code||''} ${p?.name||''} ${p?.description||''}`); }
function firstDenomination(v) { if(typeof v==='number') return v; const m=String(v||'').replace(/,/g,'').match(/\d+(?:\.\d+)?/); return m?Number(m[0]):0; }

export default function ESimStep({ step }) {
 const { serviceData, updateServiceData } = useApp();
 const [products,setProducts]=useState([]),[options,setOptions]=useState([]),[loading,setLoading]=useState(false),[optionsLoading,setOptionsLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ if(step!==0)return; let alive=true; setLoading(true); setError('');
  apiProviderService.getIimmpactCatalogForUser('', 'eSIM', serviceData.country || 'MY')
   .then(c=>{ if(!alive)return; const categoryCodes=esimProductCodes(c); const list=Object.values(c?.products||{}).filter(p=>p&&p.is_active!==false&&p.code&&(categoryCodes.has(String(p.code))||isExplicitEsim(p))); setProducts(list); if(!serviceData.productCode&&list.length===1) updateServiceData({productCode:list[0].code,product:list[0].name}); })
   .catch(e=>alive&&setError(e?.message||'Unable to load eSIM plans.')).finally(()=>alive&&setLoading(false));
  return()=>{alive=false};
 },[step]);
 const selectedProduct=useMemo(()=>products.find(p=>String(p.code)===String(serviceData.productCode))||null,[products,serviceData.productCode]);
 useEffect(()=>{ if(step!==2||!selectedProduct)return; let alive=true;
  const field=(selectedProduct.fields||[]).find(f=>f&&f.type==='select'&&(f.role==='pricing'||/plan|package|data/i.test(String(f.id||f.label||''))));
  if(!field){setOptions([]);return()=>{alive=false};}
  const params=field.data_source?.params||{}, productCode=params.product_code?.static||selectedProduct.code, fieldId=params.field_id?.static||field.id;
  setOptionsLoading(true);
  apiProviderService.getIimmpactOptions({service:'eSIM',country:serviceData.country || 'MY',productCode,fieldId,limit:25000})
   .then(o=>alive&&setOptions(Array.isArray(o?.items)?o.items:[])).catch(e=>alive&&setError(e?.message||'Unable to load eSIM packages.')).finally(()=>alive&&setOptionsLoading(false));
  return()=>{alive=false};
 },[step,selectedProduct]);
 if(step===0)return <View><FormLabel>Select eSIM</FormLabel>{loading?<ActivityIndicator/>:products.length?products.map(p=><View key={p.code} style={{marginBottom:10}}><PackagePicker packages={[{id:p.code,name:p.name,data:p.note||'',valid:p.processing_time||'',price:firstDenomination(p.denomination),description:p.note||''}]} selectedName={serviceData.product===p.name?p.name:''} onSelect={()=>updateServiceData({productCode:p.code,product:p.name,package:'',packageId:'',amount:firstDenomination(p.denomination),subproductCode:''})}/></View>):<FormLabel>{error||'No eSIM products are currently available.'}</FormLabel>}</View>;
 if(step===1)return <View><FormLabel>Recipient email / eSIM identifier</FormLabel><FormInput placeholder="Enter email or recipient identifier" keyboardType="email-address" autoCapitalize="none" value={serviceData.accountNumber||''} onChangeText={v=>updateServiceData({accountNumber:v,email:v})}/><FormLabel>{selectedProduct?.note||'Delivery details will be provided after successful purchase.'}</FormLabel></View>;
 if(step===2){ const plans=options.map(o=>({id:String(o.code||o.id||''),name:String(o.label||o.name||o.description||o.code||''),data:Array.isArray(o.features)?o.features.join(' • '):(o.description||''),valid:o.validity||o.valid||o.duration||'',description:o.description||'',features:Array.isArray(o.features)?o.features:[],price:Number(o.denomination??o.price?.amount??o.amount??0)})).filter(p=>p.id&&p.price>0);
  if(optionsLoading)return <View><FormLabel>Loading eSIM packages…</FormLabel><ActivityIndicator/></View>;
  if(!plans.length){const amount=firstDenomination(selectedProduct?.denomination); return <View><FormLabel>{selectedProduct?.name||'eSIM package'}</FormLabel>{amount>0?<PackagePicker packages={[{id:selectedProduct.code,name:selectedProduct.name,data:selectedProduct.note||'',valid:selectedProduct.processing_time||'',price:amount}]} selectedName={serviceData.package} onSelect={p=>updateServiceData({package:p.name,packageId:p.id,amount:p.price,subproductCode:''})}/>:<FormLabel>{error||'No eSIM packages are available right now.'}</FormLabel>}</View>;}
  return <View><FormLabel>{selectedProduct?.name||'Select eSIM package'}</FormLabel><PackagePicker packages={plans} selectedName={serviceData.package} onSelect={p=>updateServiceData({package:p.name,packageId:p.id,amount:p.price,subproductCode:p.id})}/></View>; }
 return <View><FormLabel>eSIM order ready</FormLabel></View>;
}

export function validateStep(step,data){ if(step===0&&!data.productCode)return 'Please select an eSIM product.'; if(step===1&&!(data.accountNumber||'').trim())return 'Please enter the recipient email or eSIM identifier.'; if(step===2&&!(data.package||data.amount))return 'Please select an eSIM package.'; return null; }