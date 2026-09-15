import React, { useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { banksByCountry, ewalletsByCountry, cashPickupByCountry, RELATIONSHIPS, ID_TYPES } from '../data/remittanceOptions';
import { FormLabel, FormInput, SearchPicker, MethodCard, TxOptionCard, SummaryCard, OutlineButton } from '../components/ui';
import { getSavedReceivers } from '../firebase/receiverService';

export default function RemittanceReceiverStep({ serviceData, updateServiceData, authUser }) {
  const { colors } = useTheme();
  const mode = serviceData.receiverMode;
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === 'saved' && authUser?.uid) {
      setLoading(true);
      getSavedReceivers(authUser.uid).then(setSaved).finally(() => setLoading(false));
    }
  }, [mode, authUser?.uid]);

  if (!mode) return <View>
    <FormLabel>Receiver</FormLabel>
    <MethodCard icon="➕" bg="#E3F2FD" name="Add New Receiver" detail="Enter only the details needed to deliver the money" onPress={() => updateServiceData({ receiverMode: 'new' })}/>
    <MethodCard icon="📇" bg="#E8F5E9" name="Select Saved Receiver" detail="Use a receiver you saved before" onPress={() => updateServiceData({ receiverMode: 'saved' })}/>
  </View>;

  if (mode === 'new') {
    const method = serviceData.method;
    const country = serviceData.country;
    const banks = banksByCountry[country] || [];
    const selectedBank = banks.find((b) => b.name === serviceData.receiverBankName);
    const branchOptions = selectedBank ? selectedBank.branches : [];
    const bankIsOther = serviceData.receiverBankIsOther || (!!serviceData.receiverBankName && !selectedBank);
    const branchIsOther = serviceData.receiverBranchIsOther || (!!serviceData.receiverBranch && selectedBank && !branchOptions.some((b) => (b.name || b) === serviceData.receiverBranch));

    return <View>
      <FormLabel>Receiver Details</FormLabel>
      <FormInput placeholder="First Name" value={serviceData.receiverFirstName || ''} onChangeText={(v) => updateServiceData({ receiverFirstName: v })}/>
      <FormInput placeholder="Last Name" value={serviceData.receiverLastName || ''} onChangeText={(v) => updateServiceData({ receiverLastName: v })}/>
      <SearchPicker placeholder="Relationship to Receiver" title="Select Relationship" value={serviceData.receiverRelationship} items={RELATIONSHIPS} searchable={false} onSelect={(v) => updateServiceData({ receiverRelationship: v })}/>
      <FormInput placeholder="Mobile Number" keyboardType="phone-pad" value={serviceData.receiverPhone || ''} onChangeText={(v) => updateServiceData({ receiverPhone: v })}/>

      {method === 'deposit' && <>
        {bankIsOther ? <>
          <FormInput placeholder="Bank Name" value={serviceData.receiverBankName || ''} onChangeText={(v) => updateServiceData({ receiverBankName: v })}/>
          {banks.length > 0 && <OutlineButton label="Choose from bank list instead" onPress={() => updateServiceData({ receiverBankName: null, receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: false, receiverBranchIsOther: false })}/>} 
        </> : <SearchPicker placeholder="Select Bank" title="Select Bank" value={serviceData.receiverBankName} items={[...banks.map((b) => b.name), { key: '__other__', name: 'Other / Not Listed' }]} onSelect={(v) => v === '__other__' ? updateServiceData({ receiverBankName: '', receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: true, receiverBranchIsOther: true }) : updateServiceData({ receiverBankName: v, receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: false, receiverBranchIsOther: false })}/>} 
        <FormInput placeholder="Account Number" keyboardType="number-pad" value={serviceData.receiverAccountNumber || ''} onChangeText={(v) => updateServiceData({ receiverAccountNumber: v })}/>
        {branchIsOther || bankIsOther ? <>
          <FormInput placeholder="Branch Name" value={serviceData.receiverBranch || ''} onChangeText={(v) => updateServiceData({ receiverBranch: v })}/>
          {!bankIsOther && branchOptions.length > 0 && <OutlineButton label="Choose from branch list instead" onPress={() => updateServiceData({ receiverBranch: null, receiverRoutingNumber: null, receiverBranchIsOther: false })}/>} 
        </> : <SearchPicker placeholder={selectedBank ? 'Select Branch' : 'Select a bank first'} title="Select Branch" value={serviceData.receiverBranch} items={[...branchOptions, { key: '__other__', name: 'Other / Not Listed' }]} onSelect={(v, item) => v === '__other__' ? updateServiceData({ receiverBranch: '', receiverRoutingNumber: null, receiverBranchIsOther: true }) : updateServiceData({ receiverBranch: item?.name || v, receiverRoutingNumber: item?.routing || null, receiverBranchIsOther: false })}/>} 
      </>}

      {method === 'cash' && <>
        <SearchPicker placeholder="Pickup Network" title="Select Pickup Network" value={serviceData.receiverPickupNetwork} items={cashPickupByCountry[country] || []} onSelect={(v) => updateServiceData({ receiverPickupNetwork: v })}/>
        <SearchPicker placeholder="ID Type" title="Select ID Type" value={serviceData.receiverIdType} items={ID_TYPES} searchable={false} onSelect={(v) => updateServiceData({ receiverIdType: v })}/>
        <FormInput placeholder="ID Number" value={serviceData.receiverIdNumber || ''} onChangeText={(v) => updateServiceData({ receiverIdNumber: v })}/>
        <FormInput placeholder="Pickup City" value={serviceData.receiverPickupCity || ''} onChangeText={(v) => updateServiceData({ receiverPickupCity: v })}/>
      </>}

      {method === 'ewallet' && <>
        <SearchPicker placeholder="eWallet Provider" title="Select eWallet Provider" value={serviceData.receiverWalletProvider} items={ewalletsByCountry[country] || []} onSelect={(v) => updateServiceData({ receiverWalletProvider: v })}/>
        <FormInput placeholder="Wallet Number / Account ID" keyboardType="phone-pad" value={serviceData.receiverWalletNumber || ''} onChangeText={(v) => updateServiceData({ receiverWalletNumber: v })}/>
      </>}

      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:colors.card, padding:14, borderRadius:12, marginBottom:14, borderWidth:1, borderColor:colors.border }}>
        <Text style={{ fontSize:14, fontWeight:'600', color:colors.text }}>Save as Favorite</Text>
        <Switch value={!!serviceData.saveAsFavorite} onValueChange={(v) => updateServiceData({ saveAsFavorite: v })} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.card}/>
      </View>
      <ReceiverPreview serviceData={serviceData}/>
      <OutlineButton label="← Choose a saved receiver instead" onPress={() => updateServiceData({ receiverMode: 'saved' })}/>
    </View>;
  }

  return <View>
    <FormLabel>Saved Receivers</FormLabel>
    {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }}/>} 
    {!loading && saved.length === 0 && <Text style={{ color:colors.textSecondary, textAlign:'center', marginVertical:20 }}>No saved receivers yet.</Text>}
    {!loading && saved.map((r) => <TxOptionCard key={r.id} title={`${r.firstName || ''} ${r.lastName || ''}`.trim()} detail={[r.relationship, r.phone, r.bankName, r.pickupNetwork, r.walletProvider].filter(Boolean).join('  •  ')} selected={serviceData.selectedReceiverId === r.id} onPress={() => updateServiceData({ selectedReceiverId: r.id, receiverFirstName: r.firstName, receiverLastName: r.lastName, receiverPhone: r.phone, receiverRelationship: r.relationship, receiverCountry: r.country, receiverBankName: r.bankName, receiverAccountNumber: r.accountNumber, receiverBranch: r.branch, receiverRoutingNumber: r.routingNumber, receiverPickupNetwork: r.pickupNetwork, receiverIdType: r.idType, receiverIdNumber: r.idNumber, receiverPickupCity: r.pickupCity, receiverWalletProvider: r.walletProvider, receiverWalletNumber: r.walletNumber })}/>)}
    <OutlineButton label="+ Add a new receiver instead" onPress={() => updateServiceData({ receiverMode: 'new' })}/>
  </View>;
}

function ReceiverPreview({ serviceData }) {
  const method = serviceData.method;
  const name = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
  const rows = [
    { label: 'Name', value: name || '-' },
    { label: 'Relationship', value: serviceData.receiverRelationship || '-' },
    { label: 'Mobile', value: serviceData.receiverPhone || '-' },
  ];
  if (method === 'deposit') rows.push(
    { label: 'Bank', value: serviceData.receiverBankName || '-' },
    { label: 'Account No.', value: serviceData.receiverAccountNumber || '-' },
    { label: 'Branch', value: serviceData.receiverBranch || '-' },
  );
  if (method === 'cash') rows.push(
    { label: 'Pickup Network', value: serviceData.receiverPickupNetwork || '-' },
    { label: 'ID', value: serviceData.receiverIdType ? `${serviceData.receiverIdType} - ${serviceData.receiverIdNumber || ''}` : '-' },
    { label: 'Pickup City', value: serviceData.receiverPickupCity || '-' },
  );
  if (method === 'ewallet') rows.push(
    { label: 'Wallet Provider', value: serviceData.receiverWalletProvider || '-' },
    { label: 'Wallet Number', value: serviceData.receiverWalletNumber || '-' },
  );
  return <SummaryCard title="Receiver Summary" rows={rows}/>;
}
