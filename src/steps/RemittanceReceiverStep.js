import React, { useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { banksByCountry, ewalletsByCountry, cashPickupByCountry, RELATIONSHIPS, ID_TYPES } from '../data/remittanceOptions';
import { FormLabel, FormInput, SearchPicker, MethodCard, TxOptionCard, SummaryCard, OutlineButton, DateField } from '../components/ui';
import { getSavedReceivers } from '../firebase/receiverService';
import { countries } from '../data/countries';

export default function RemittanceReceiverStep({ serviceData, updateServiceData, authUser, profile }) {
  const { colors } = useTheme();
  const mode = serviceData.receiverMode;
  const recipientType = serviceData.recipientType;
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const isKycVerified = profile?.verified === true || profile?.verificationStatus === 'approved';
  const ownCountry = countries.find((c) => c.code === profile?.country)?.name || profile?.nationality || '';

  const useMyKyc = () => {
    const parts = String(profile?.name || profile?.displayName || '').trim().split(/\s+/).filter(Boolean);
    updateServiceData({ recipientType:'self', receiverMode:'self', selectedReceiverId:null, receiverFirstName:parts[0] || '', receiverLastName:parts.slice(1).join(' ') || '', receiverPhone:profile?.phone || authUser?.phoneNumber || '', receiverRelationship:'Self', receiverNationality:ownCountry, receiverDateOfBirth:profile?.dateOfBirth || '', receiverAddress:profile?.address || profile?.residentialAddress || '', receiverIdType:profile?.documentType || profile?.idType || '', receiverIdNumber:profile?.documentNumber || profile?.passportNumber || '', receiverBankName:null, receiverAccountNumber:null, receiverBranch:null, receiverRoutingNumber:null, receiverPickupNetwork:null, receiverPickupCity:null, receiverWalletProvider:null, receiverWalletNumber:null });
  };

  useEffect(() => {
    if (mode === 'saved' && authUser?.uid) { setLoading(true); getSavedReceivers(authUser.uid).then(setSaved).finally(() => setLoading(false)); }
  }, [mode, authUser?.uid]);

  if (!recipientType) return <View><FormLabel>Who are you sending to?</FormLabel><Text style={{color:colors.textSecondary,fontSize:12,lineHeight:18,marginBottom:12}}>Choose yourself to securely reuse your approved KYC information, or choose someone else and enter their required recipient details.</Text><MethodCard icon="👤" bg="#E8F5E9" name="Myself" detail={isKycVerified?'Use my approved KYC information':'KYC verification is required first'} onPress={() => {if(isKycVerified) useMyKyc();}}/><MethodCard icon="👥" bg="#E3F2FD" name="Someone else" detail="Enter the recipient's required information" onPress={() => updateServiceData({recipientType:'other',receiverMode:'new'})}/></View>;
  if (recipientType === 'self') return <View><FormLabel>Recipient — Myself</FormLabel>{isKycVerified && <><View style={{padding:14,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,marginBottom:14}}><Text style={{fontSize:12,color:colors.textSecondary,marginBottom:4}}>Approved KYC information</Text><Text style={{color:colors.text,fontSize:16,fontWeight:'800'}}>{serviceData.receiverFirstName} {serviceData.receiverLastName}</Text><Text style={{color:colors.textSecondary,marginTop:4}}>{serviceData.receiverPhone}</Text><Text style={{color:colors.textSecondary,marginTop:3}}>{serviceData.receiverNationality}</Text></View><OutlineButton label="← Change to someone else" onPress={()=>updateServiceData({recipientType:'other',receiverMode:'new'})}/></>}</View>;

  if (mode === 'new') {
    const method = serviceData.method;
    const country = serviceData.country;
    const banks = banksByCountry[country] || [];
    const selectedBank = banks.find((b) => b.name === serviceData.receiverBankName);
    const branchOptions = selectedBank?.branches || [];
    const bankIsOther = serviceData.receiverBankIsOther === true;
    const branchIsOther = serviceData.receiverBranchIsOther === true;
    const bankSelected = !!(serviceData.receiverBankName || '').trim();
    const accountEntered = !!(serviceData.receiverAccountNumber || '').trim();
    const branchSelected = !!(serviceData.receiverBranch || '').trim();
    const routingAvailable = !!(serviceData.receiverRoutingNumber || '').trim();

    const selectBank = (value) => {
      const other = value === 'Other / Not Listed';
      updateServiceData({receiverBankName:other?'':value,receiverBankIsOther:other,receiverAccountNumber:'',receiverBranch:'',receiverBranchIsOther:false,receiverRoutingNumber:''});
    };
    const selectBranch = (value) => {
      const other = value === 'Other / Not Listed';
      const branch = !other ? branchOptions.find((b)=>(b.name || b) === value) : null;
      updateServiceData({receiverBranch:other?'':value,receiverBranchIsOther:other,receiverRoutingNumber:branch?.routing || ''});
    };

    return <View>
      <FormLabel>Recipient Details</FormLabel>
      <Text style={{color:colors.textSecondary,fontSize:12,lineHeight:18,marginBottom:12}}>For someone else, enter the recipient's identity and payout details exactly as required.</Text>
      <FormInput placeholder="First Name" value={serviceData.receiverFirstName||''} onChangeText={(v)=>updateServiceData({receiverFirstName:v})}/>
      <FormInput placeholder="Last Name" value={serviceData.receiverLastName||''} onChangeText={(v)=>updateServiceData({receiverLastName:v})}/>
      <SearchPicker placeholder="Relationship to Receiver" title="Select Relationship" value={serviceData.receiverRelationship} items={RELATIONSHIPS} searchable={false} onSelect={(v)=>updateServiceData({receiverRelationship:v})}/>
      <FormInput placeholder="Mobile Number" keyboardType="phone-pad" value={serviceData.receiverPhone||''} onChangeText={(v)=>updateServiceData({receiverPhone:v})}/>
      <SearchPicker placeholder="Nationality" title="Select Recipient Nationality" value={serviceData.receiverNationality} items={[...new Set(countries.map((c)=>c.name).filter(Boolean))].sort()} onSelect={(v)=>updateServiceData({receiverNationality:v})}/>
      <DateField placeholder="Date of Birth" value={serviceData.receiverDateOfBirth||''} onChange={(v)=>updateServiceData({receiverDateOfBirth:v})} maximumDate={new Date()}/>
      <FormInput placeholder="Residential Address" multiline value={serviceData.receiverAddress||''} onChangeText={(v)=>updateServiceData({receiverAddress:v})}/>

      {method === 'deposit' && <>
        <FormLabel>Bank Details</FormLabel>
        <SearchPicker placeholder="1. Select Bank Name" title="Select Bank Name" value={serviceData.receiverBankName} items={banks.map((b)=>b.name).concat('Other / Not Listed')} onSelect={selectBank}/>

        {bankIsOther && <FormInput placeholder="Enter Bank Name" value={serviceData.receiverBankName||''} onChangeText={(v)=>updateServiceData({receiverBankName:v,receiverBankIsOther:true})}/>}

        {(bankSelected || bankIsOther) && <FormInput placeholder="2. Account Number" keyboardType="number-pad" value={serviceData.receiverAccountNumber||''} onChangeText={(v)=>updateServiceData({receiverAccountNumber:v,receiverBranch:'',receiverBranchIsOther:false,receiverRoutingNumber:''})}/>}

        {((bankSelected || bankIsOther) && accountEntered) && (bankIsOther ? (
          <>
            <FormInput placeholder="3. Enter Branch Name" value={serviceData.receiverBranch||''} onChangeText={(v)=>updateServiceData({receiverBranch:v,receiverBranchIsOther:true,receiverRoutingNumber:''})}/>
            {branchSelected && <FormInput placeholder="4. Routing Number" keyboardType="number-pad" value={serviceData.receiverRoutingNumber||''} onChangeText={(v)=>updateServiceData({receiverRoutingNumber:v})}/>}
          </>
        ) : (
          <>
            <SearchPicker placeholder="3. Select Branch" title="Select Bank Branch" value={serviceData.receiverBranch} items={branchOptions.map((b)=>b.name||b).concat('Other / Not Listed')} onSelect={selectBranch}/>
            {branchSelected && !branchIsOther && routingAvailable && <View style={{padding:12,borderRadius:10,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,marginBottom:12}}><Text style={{color:colors.textSecondary,fontSize:12}}>4. Routing Number</Text><Text style={{color:colors.text,fontSize:15,fontWeight:'700',marginTop:3}}>{serviceData.receiverRoutingNumber}</Text><Text style={{color:colors.textSecondary,fontSize:11,marginTop:3}}>Automatically selected from the branch</Text></View>}
            {branchIsOther && branchSelected && <FormInput placeholder="4. Routing Number" keyboardType="number-pad" value={serviceData.receiverRoutingNumber||''} onChangeText={(v)=>updateServiceData({receiverRoutingNumber:v})}/>}
            {branchSelected && !routingAvailable && !branchIsOther && <FormInput placeholder="4. Routing Number" keyboardType="number-pad" value={serviceData.receiverRoutingNumber||''} onChangeText={(v)=>updateServiceData({receiverRoutingNumber:v})}/>}
          </>
        ))}
      </>}

      {method === 'cash' && <><SearchPicker placeholder="Pickup Network" title="Select Pickup Network" value={serviceData.receiverPickupNetwork} items={cashPickupByCountry[country]||[]} onSelect={(v)=>updateServiceData({receiverPickupNetwork:v})}/><SearchPicker placeholder="ID Type" title="Select ID Type" value={serviceData.receiverIdType} items={ID_TYPES} searchable={false} onSelect={(v)=>updateServiceData({receiverIdType:v})}/><FormInput placeholder="ID Number" value={serviceData.receiverIdNumber||''} onChangeText={(v)=>updateServiceData({receiverIdNumber:v})}/><FormInput placeholder="Pickup City" value={serviceData.receiverPickupCity||''} onChangeText={(v)=>updateServiceData({receiverPickupCity:v})}/></>}
      {method === 'ewallet' && <><SearchPicker placeholder="eWallet Provider" title="Select eWallet Provider" value={serviceData.receiverWalletProvider} items={ewalletsByCountry[country]||[]} onSelect={(v)=>updateServiceData({receiverWalletProvider:v})}/><FormInput placeholder="Wallet Number / Account ID" keyboardType="phone-pad" value={serviceData.receiverWalletNumber||''} onChangeText={(v)=>updateServiceData({receiverWalletNumber:v})}/></>}
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.card,padding:14,borderRadius:12,marginBottom:14,borderWidth:1,borderColor:colors.border}}><Text style={{fontSize:14,fontWeight:'600',color:colors.text}}>Save as Favorite</Text><Switch value={!!serviceData.saveAsFavorite} onValueChange={(v)=>updateServiceData({saveAsFavorite:v})} trackColor={{false:colors.border,true:colors.primary}} thumbColor={colors.card}/></View>
      <ReceiverPreview serviceData={serviceData}/>
      <OutlineButton label="← Change recipient type" onPress={()=>updateServiceData({recipientType:null,receiverMode:null})}/>
    </View>;
  }

  return (
    <View>
      <FormLabel>Saved Receivers</FormLabel>
      {loading && (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginVertical: 20 }}
        />
      )}
      {!loading && saved.length === 0 && (
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }}>
          No saved receivers yet.
        </Text>
      )}
      {!loading && saved.map((r) => (
        <TxOptionCard
          key={r.id}
          title={`${r.firstName || ''} ${r.lastName || ''}`.trim()}
          detail={[r.relationship, r.phone, r.bankName, r.pickupNetwork, r.walletProvider].filter(Boolean).join('  •  ')}
          selected={serviceData.selectedReceiverId === r.id}
          onPress={() => updateServiceData({
            selectedReceiverId: r.id,
            receiverMode: 'saved',
            recipientType: 'other',
            receiverFirstName: r.firstName,
            receiverLastName: r.lastName,
            receiverPhone: r.phone,
            receiverRelationship: r.relationship,
            receiverNationality: r.nationality || '',
            receiverDateOfBirth: r.dateOfBirth || '',
            receiverAddress: r.address || '',
            receiverBankName: r.bankName,
            receiverAccountNumber: r.accountNumber,
            receiverBranch: r.branch,
            receiverRoutingNumber: r.routingNumber,
            receiverPickupNetwork: r.pickupNetwork,
            receiverIdType: r.idType,
            receiverIdNumber: r.idNumber,
            receiverPickupCity: r.pickupCity,
            receiverWalletProvider: r.walletProvider,
            receiverWalletNumber: r.walletNumber,
          })}
        />
      ))}
      <OutlineButton
        label="+ Add a new receiver instead"
        onPress={() => updateServiceData({ receiverMode: 'new', recipientType: 'other' })}
      />
      <OutlineButton
        label="← Change recipient type"
        onPress={() => updateServiceData({ recipientType: null, receiverMode: null })}
      />
    </View>
  );

}

function ReceiverPreview({serviceData}) {
  const method=serviceData.method;
  const rows=[{label:'Name',value:`${serviceData.receiverFirstName||''} ${serviceData.receiverLastName||''}`.trim()||'-'},{label:'Relationship',value:serviceData.receiverRelationship||'-'},{label:'Mobile',value:serviceData.receiverPhone||'-'},{label:'Nationality',value:serviceData.receiverNationality||'-'},{label:'Date of Birth',value:serviceData.receiverDateOfBirth||'-'},{label:'Address',value:serviceData.receiverAddress||'-'}];
  if(method==='deposit') rows.push({label:'Bank',value:serviceData.receiverBankName||'-'},{label:'Account No.',value:serviceData.receiverAccountNumber||'-'},{label:'Branch',value:serviceData.receiverBranch||'-'},{label:'Routing Number',value:serviceData.receiverRoutingNumber||'-'});
  if(method==='cash') rows.push({label:'Pickup Network',value:serviceData.receiverPickupNetwork||'-'},{label:'ID',value:serviceData.receiverIdType?`${serviceData.receiverIdType} - ${serviceData.receiverIdNumber||''}`:'-'},{label:'Pickup City',value:serviceData.receiverPickupCity||'-'});
  if(method==='ewallet') rows.push({label:'Wallet Provider',value:serviceData.receiverWalletProvider||'-'},{label:'Wallet Number',value:serviceData.receiverWalletNumber||'-'});
  return <SummaryCard title="Recipient Summary" rows={rows}/>;
}
