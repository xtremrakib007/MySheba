import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import { banksByCountry, ewalletsByCountry, cashPickupByCountry, RELATIONSHIPS, ID_TYPES } from '../data/remittanceOptions';
import { FormLabel, Grid3, SelectCard, FormInput, FormTextArea, SearchPicker, DateField, MethodCard, TxOptionCard, SummaryCard, OutlineButton } from '../components/ui';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { getSavedReceivers, uploadPassport } from '../firebase/receiverService';

const DEFAULT_FEE = 7.0;
const RECEIVING_METHODS = [
  { key: 'deposit', icon: '🏦', bg: '#E3F2FD', name: 'Bank Account', speed: '2-3 business days' },
  { key: 'cash', icon: '💵', bg: '#E8F5E9', name: 'Cash Pickup', speed: 'Usually within minutes' },
  { key: 'ewallet', icon: '📱', bg: '#FFF3E0', name: 'eWallet', speed: 'Usually within minutes' },
];
const PAYMENT_METHODS = [
  { key: 'ewallet', label: 'eWallet' }, { key: 'fpx', label: 'FPX' }, { key: 'debit', label: 'Debit Card' }, { key: 'cash', label: 'Pay in Cash' },
];
const GENDERS = ['Male', 'Female', 'Other'];

function getRate(country, method, rates) {
  if (country === 'BD') return method === 'deposit' ? (rates.BD_ACC || 30.26) : (rates.BD_CASH || 30.11);
  return rates[country] || 30.26;
}

export default function RemittanceStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates, authUser, profile } = useApp();
  const curr = (countries.find((c) => c.code === serviceData.country) || {}).curr || '';
  const destinationCountries = countries.filter((c) => c.code !== 'MY');

  if (step === 0) return <View><FormLabel>Select Destination Country</FormLabel><Grid3>{destinationCountries.map((c) => <SelectCard key={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code }); nextStep(); }} />)}</Grid3></View>;

  if (step === 1) return <View><FormLabel>Select Receiving Method</FormLabel>{RECEIVING_METHODS.map((m) => { const rate = getRate(serviceData.country, m.key, rates); return <MethodCard key={m.key} icon={m.icon} bg={m.bg} name={m.name} detail={`${m.speed}  •  1.00 MYR = ${rate} ${curr}`} onPress={() => { updateServiceData({ method: m.key, receivingRate: rate, receivingSpeed: m.speed }); nextStep(); }} />; })}</View>;

  if (step === 2) {
    const fee = rates.remittanceFee != null ? rates.remittanceFee : DEFAULT_FEE;
    return <View><FormLabel>Select Payment Method</FormLabel>{PAYMENT_METHODS.map((p) => <TxOptionCard key={p.key} title={p.label} detail={`Transfer Fee: ${fee.toFixed(2)} MYR`} selected={serviceData.paymentMethod === p.key} onPress={() => { updateServiceData({ paymentMethod: p.key, transferFee: fee }); nextStep(); }} />)}</View>;
  }

  if (step === 3) {
    const rate = serviceData.receivingRate || 30.26;
    const fee = serviceData.transferFee != null ? serviceData.transferFee : (rates.remittanceFee != null ? rates.remittanceFee : DEFAULT_FEE);
    const sendAmt = Number(serviceData.sendAmt || 0); const total = sendAmt + fee; const recAmt = sendAmt * rate;
    return <View><FormLabel>Transfer Amount (MYR)</FormLabel><FormInput keyboardType="numeric" placeholder="0.00" value={serviceData.sendAmt != null ? String(serviceData.sendAmt) : ''} onChangeText={(v) => updateServiceData({ sendAmt: parseFloat(v) || 0 })}/><SummaryCard title="📋 Review Transfer Summary" rows={[{ label: 'Transfer Amount', value: `${sendAmt.toFixed(2)} MYR` }, { label: 'Exchange Rate', value: `1.00 MYR = ${rate} ${curr}` }, { label: 'Transfer Fee', value: `${fee.toFixed(2)} MYR` }, { label: 'Total', value: `${total.toFixed(2)} MYR` }]} totalLabel="Recipient Gets" totalValue={`${recAmt.toFixed(2)} ${curr}`} /></View>;
  }

  if (step === 4) return <SelectOrAddReceiver serviceData={serviceData} updateServiceData={updateServiceData} authUser={authUser} />;

  if (step === 5) return <View>
    <FormLabel>Sender Details</FormLabel>
    <FormInput placeholder="Full Name" value={serviceData.senderName || ''} onChangeText={(v) => updateServiceData({ senderName: v })}/>
    <FormInput placeholder="Mobile Number" keyboardType="phone-pad" value={serviceData.senderPhone || ''} onChangeText={(v) => updateServiceData({ senderPhone: v })}/>
    <FormInput placeholder="Customer ID (if assigned)" value={serviceData.customerId || profile?.customerId || ''} onChangeText={(v) => updateServiceData({ customerId: v })}/>
    <FormInput placeholder="Company / Employer Name" value={serviceData.senderCompany || serviceData.employerName || ''} onChangeText={(v) => updateServiceData({ senderCompany: v, employerName: v })}/>
    <FormInput placeholder="Passport Number" autoCapitalize="characters" value={serviceData.senderPassportNo || ''} onChangeText={(v) => updateServiceData({ senderPassportNo: v })}/>
    <FormInput placeholder="Passport Place of Issue" value={serviceData.senderPassportIssuePlace || ''} onChangeText={(v) => updateServiceData({ senderPassportIssuePlace: v })}/>
    <DateField placeholder="Passport Issue Date" value={serviceData.senderPassportIssueDate} onChange={(v) => updateServiceData({ senderPassportIssueDate: v })} maximumDate={new Date()}/>
    <DateField placeholder="Passport Expiry Date" value={serviceData.senderPassportExpiry} onChange={(v) => updateServiceData({ senderPassportExpiry: v })} minimumDate={new Date()}/>
    <FormTextArea placeholder="Sender Address" value={serviceData.senderAddress || ''} onChangeText={(v) => updateServiceData({ senderAddress: v })}/>
    <DateField placeholder="Date of Birth" value={serviceData.senderDob} onChange={(v) => updateServiceData({ senderDob: v })} maximumDate={new Date()}/>
    <SearchPicker placeholder="Gender" title="Select Gender" value={serviceData.gender} items={GENDERS} searchable={false} onSelect={(v) => updateServiceData({ gender: v })}/>
    <FormInput placeholder="Occupation" value={serviceData.occupation || ''} onChangeText={(v) => updateServiceData({ occupation: v })}/>
    <FormInput placeholder="Skilled Labor / Skill" value={serviceData.skilledLabor || ''} onChangeText={(v) => updateServiceData({ skilledLabor: v })}/>
    <FormInput placeholder="Source of Funds" value={serviceData.sourceOfFunds || ''} onChangeText={(v) => updateServiceData({ sourceOfFunds: v })}/>
    <FormInput placeholder="Purpose of Remittance" value={serviceData.purpose || ''} onChangeText={(v) => updateServiceData({ purpose: v })}/>
    <FormInput placeholder="Nationality" value={serviceData.nationality || ''} onChangeText={(v) => updateServiceData({ nationality: v })}/>
    <PassportUpload serviceData={serviceData} updateServiceData={updateServiceData} authUser={authUser}/>
  </View>;

  if (step === 6) {
    const rate = serviceData.receivingRate || 30.26; const fee = serviceData.transferFee != null ? serviceData.transferFee : DEFAULT_FEE; const sendAmt = Number(serviceData.sendAmt || 0); const total = sendAmt + fee; const recAmt = sendAmt * rate;
    const methodLabel = (RECEIVING_METHODS.find((m) => m.key === serviceData.method) || {}).name || '';
    const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
    return <View><SummaryCard title="📋 Final Remittance Review" rows={[
      { label: 'Payout Country', value: serviceData.country || '' }, { label: 'Receiving Method', value: methodLabel }, { label: 'Payment Method', value: serviceData.paymentMethod || '' },
      { label: 'Sender', value: serviceData.senderName || '' }, { label: 'Customer ID', value: serviceData.customerId || profile?.customerId || '' }, { label: 'Sender Mobile', value: serviceData.senderPhone || '' },
      { label: 'Passport', value: serviceData.senderPassportNo || '' }, { label: 'Passport Issue / Expiry', value: `${serviceData.senderPassportIssueDate || '-'} / ${serviceData.senderPassportExpiry || '-'}` }, { label: 'Passport Place of Issue', value: serviceData.senderPassportIssuePlace || '' },
      { label: 'Address', value: serviceData.senderAddress || '' }, { label: 'Date of Birth', value: serviceData.senderDob || '' }, { label: 'Employer', value: serviceData.employerName || serviceData.senderCompany || '' }, { label: 'Gender', value: serviceData.gender || '' },
      { label: 'Occupation', value: serviceData.occupation || '' }, { label: 'Skilled Labor', value: serviceData.skilledLabor || '' }, { label: 'Source of Funds', value: serviceData.sourceOfFunds || '' }, { label: 'Nationality', value: serviceData.nationality || '' }, { label: 'Purpose', value: serviceData.purpose || '' },
      { label: 'Receiver', value: receiverName }, { label: 'Relationship', value: serviceData.receiverRelationship || '' }, { label: 'Receiver Mobile', value: serviceData.receiverPhone || '' }, { label: 'Receiver Address', value: serviceData.receiverAddress || '' }, { label: 'Receiver Place of Issue', value: serviceData.receiverPlaceOfIssue || '' },
      ...(serviceData.method === 'deposit' ? [{ label: 'Bank', value: serviceData.receiverBankName || '' }, { label: 'Account No.', value: serviceData.receiverAccountNumber || '' }, { label: 'Branch', value: serviceData.receiverBranch || '' }, { label: 'Routing No.', value: serviceData.receiverRoutingNumber || '' }] : []),
      ...(serviceData.method === 'cash' ? [{ label: 'Pickup Network', value: serviceData.receiverPickupNetwork || '' }, { label: 'Receiver ID', value: `${serviceData.receiverIdType || ''} ${serviceData.receiverIdNumber || ''}`.trim() }, { label: 'Pickup City', value: serviceData.receiverPickupCity || '' }] : []),
      ...(serviceData.method === 'ewallet' ? [{ label: 'Wallet Provider', value: serviceData.receiverWalletProvider || '' }, { label: 'Wallet Number', value: serviceData.receiverWalletNumber || '' }] : []),
      { label: 'Transfer Amount', value: `${sendAmt.toFixed(2)} MYR` }, { label: 'Service Charge', value: `${fee.toFixed(2)} MYR` }, { label: 'Exchange Rate', value: `1 MYR = ${rate} ${curr}` }, { label: 'Receive Amount', value: `${recAmt.toFixed(2)} ${curr}` },
    ]} totalLabel="Collected Amount" totalValue={`${total.toFixed(2)} MYR`}/></View>;
  }
  return null;
}

function PassportUpload({ serviceData, updateServiceData, authUser }) {
  const { colors } = useTheme(); const styles = createStyles(colors); const [uploading, setUploading] = useState(false);
  const pick = async (fromCamera) => {
    if (fromCamera) { const perm = await ImagePicker.requestCameraPermissionsAsync(); if (!perm.granted) return showAlert('MySheba', 'Please allow camera access to capture your passport photo.'); }
    const result = fromCamera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const localUri = result.assets[0].uri; updateServiceData({ passportLocalUri: localUri, passportUrl: null }); if (!authUser?.uid) return;
    setUploading(true); try { updateServiceData({ passportUrl: await uploadPassport(authUser.uid, localUri) }); } catch (e) { showAlert('MySheba', e.message || 'Could not upload your passport photo. Please try again.'); } finally { setUploading(false); }
  };
  const choosePassport = () => showAlert('Passport Photo', 'Take a new photo or choose one from your gallery.', [{ text: 'Take Photo', onPress: () => pick(true) }, { text: 'Choose from Gallery', onPress: () => pick(false) }, { text: 'Cancel', style: 'cancel' }]);
  return <View><FormLabel>Passport Photo</FormLabel><TouchableOpacity style={styles.uploadBox} onPress={choosePassport} disabled={uploading} activeOpacity={0.8}>{serviceData.passportLocalUri ? <Image source={{ uri: serviceData.passportLocalUri }} style={styles.passportPreview} resizeMode="cover"/> : <><Text style={styles.uploadIcon}>📷</Text><Text style={styles.uploadText}>Tap to capture or upload your passport photo</Text></>}{uploading && <View style={styles.uploadOverlay}><ActivityIndicator color="white"/></View>}</TouchableOpacity>{!!serviceData.passportLocalUri && !uploading && <TouchableOpacity onPress={choosePassport}><Text style={styles.changePassport}>{serviceData.passportUrl ? '✅ Passport uploaded - tap to change' : 'Tap to retake or change photo'}</Text></TouchableOpacity>}</View>;
}

function SelectOrAddReceiver({ serviceData, updateServiceData, authUser }) {
  const { colors } = useTheme(); const styles = createStyles(colors); const mode = serviceData.receiverMode; const [saved, setSaved] = useState([]); const [loading, setLoading] = useState(false);
  useEffect(() => { if (mode === 'saved' && authUser?.uid) { setLoading(true); getSavedReceivers(authUser.uid).then(setSaved).finally(() => setLoading(false)); } }, [mode, authUser?.uid]);
  if (!mode) return <View><FormLabel>Select or Add Receiver</FormLabel><MethodCard icon="➕" bg="#E3F2FD" name="Add New Receiver" detail="Enter their details" onPress={() => updateServiceData({ receiverMode: 'new' })}/><MethodCard icon="📇" bg="#E8F5E9" name="Select Saved Receiver" detail="Choose from your favorites" onPress={() => updateServiceData({ receiverMode: 'saved' })}/></View>;
  if (mode === 'new') {
    const method = serviceData.method; const country = serviceData.country; const banks = banksByCountry[country] || []; const selectedBank = banks.find((b) => b.name === serviceData.receiverBankName); const branchOptions = selectedBank ? selectedBank.branches : [];
    const bankIsOther = serviceData.receiverBankIsOther || (!!serviceData.receiverBankName && !selectedBank); const branchIsOther = serviceData.receiverBranchIsOther || (!!serviceData.receiverBranch && selectedBank && !branchOptions.some((b) => (b.name || b) === serviceData.receiverBranch));
    return <View><FormLabel>Add New Receiver</FormLabel><FormInput placeholder="First Name" value={serviceData.receiverFirstName || ''} onChangeText={(v) => updateServiceData({ receiverFirstName: v })}/><FormInput placeholder="Last Name" value={serviceData.receiverLastName || ''} onChangeText={(v) => updateServiceData({ receiverLastName: v })}/><SearchPicker placeholder="Relationship to Receiver" title="Select Relationship" value={serviceData.receiverRelationship} items={RELATIONSHIPS} searchable={false} onSelect={(v) => updateServiceData({ receiverRelationship: v })}/><FormInput placeholder="Mobile Number" keyboardType="phone-pad" value={serviceData.receiverPhone || ''} onChangeText={(v) => updateServiceData({ receiverPhone: v })}/><FormTextArea placeholder="Receiver Address" value={serviceData.receiverAddress || ''} onChangeText={(v) => updateServiceData({ receiverAddress: v })}/><FormInput placeholder="Receiver Place of Issue" value={serviceData.receiverPlaceOfIssue || ''} onChangeText={(v) => updateServiceData({ receiverPlaceOfIssue: v })}/>
      {method === 'deposit' && <>
        {bankIsOther ? <><FormInput placeholder="Bank Name" value={serviceData.receiverBankName || ''} onChangeText={(v) => updateServiceData({ receiverBankName: v })}/>{banks.length > 0 && <OutlineButton label="Choose from bank list instead" onPress={() => updateServiceData({ receiverBankName: null, receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: false, receiverBranchIsOther: false })}/>}</> : <SearchPicker placeholder="Select Bank" title="Select Bank" value={serviceData.receiverBankName} items={[...banks.map((b) => b.name), { key: '__other__', name: 'Other / Not Listed' }]} onSelect={(v) => v === '__other__' ? updateServiceData({ receiverBankName: '', receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: true, receiverBranchIsOther: true }) : updateServiceData({ receiverBankName: v, receiverBranch: null, receiverRoutingNumber: null, receiverBankIsOther: false, receiverBranchIsOther: false })}/>} 
        <FormInput placeholder="Account Number" keyboardType="number-pad" value={serviceData.receiverAccountNumber || ''} onChangeText={(v) => updateServiceData({ receiverAccountNumber: v })}/>
        {branchIsOther || bankIsOther ? <><FormInput placeholder="Branch Name" value={serviceData.receiverBranch || ''} onChangeText={(v) => updateServiceData({ receiverBranch: v })}/>{!bankIsOther && branchOptions.length > 0 && <OutlineButton label="Choose from branch list instead" onPress={() => updateServiceData({ receiverBranch: null, receiverRoutingNumber: null, receiverBranchIsOther: false })}/>}</> : <SearchPicker placeholder={selectedBank ? 'Select Branch' : 'Select a bank first'} title="Select Branch" value={serviceData.receiverBranch} items={[...branchOptions, { key: '__other__', name: 'Other / Not Listed' }]} onSelect={(v, item) => v === '__other__' ? updateServiceData({ receiverBranch: '', receiverRoutingNumber: null, receiverBranchIsOther: true }) : updateServiceData({ receiverBranch: item?.name || v, receiverRoutingNumber: item?.routing || null, receiverBranchIsOther: false })}/>} 
        <FormInput placeholder="Routing Number (optional, if available)" keyboardType="number-pad" value={serviceData.receiverRoutingNumber || ''} onChangeText={(v) => updateServiceData({ receiverRoutingNumber: v })}/>
      </>}
      {method === 'cash' && <><SearchPicker placeholder="Pickup Network" title="Select Pickup Network" value={serviceData.receiverPickupNetwork} items={cashPickupByCountry[country] || []} onSelect={(v) => updateServiceData({ receiverPickupNetwork: v })}/><SearchPicker placeholder="ID Type" title="Select ID Type" value={serviceData.receiverIdType} items={ID_TYPES} searchable={false} onSelect={(v) => updateServiceData({ receiverIdType: v })}/><FormInput placeholder="ID Number" value={serviceData.receiverIdNumber || ''} onChangeText={(v) => updateServiceData({ receiverIdNumber: v })}/><FormInput placeholder="Pickup City" value={serviceData.receiverPickupCity || ''} onChangeText={(v) => updateServiceData({ receiverPickupCity: v })}/></>}
      {method === 'ewallet' && <><SearchPicker placeholder="eWallet Provider" title="Select eWallet Provider" value={serviceData.receiverWalletProvider} items={ewalletsByCountry[country] || []} onSelect={(v) => updateServiceData({ receiverWalletProvider: v })}/><FormInput placeholder="Wallet Number / Account ID" keyboardType="phone-pad" value={serviceData.receiverWalletNumber || ''} onChangeText={(v) => updateServiceData({ receiverWalletNumber: v })}/></>}
      <View style={styles.favoriteRow}><Text style={styles.favoriteLabel}>Save as Favorite</Text><Switch value={!!serviceData.saveAsFavorite} onValueChange={(v) => updateServiceData({ saveAsFavorite: v })} trackColor={{ true: colors.primary }}/></View><ReceiverPreview serviceData={serviceData}/><OutlineButton label="← Choose a saved receiver instead" onPress={() => updateServiceData({ receiverMode: 'saved' })}/>
    </View>;
  }
  return <View><FormLabel>Select Saved Receiver</FormLabel>{loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }}/>} {!loading && saved.length === 0 && <Text style={styles.emptyText}>No saved receivers yet.</Text>}{!loading && saved.map((r) => <TxOptionCard key={r.id} title={`${r.firstName || ''} ${r.lastName || ''}`.trim()} detail={[r.relationship, r.phone, r.bankName, r.pickupNetwork, r.walletProvider].filter(Boolean).join('  •  ')} selected={serviceData.selectedReceiverId === r.id} onPress={() => updateServiceData({ selectedReceiverId: r.id, receiverFirstName: r.firstName, receiverLastName: r.lastName, receiverPhone: r.phone, receiverRelationship: r.relationship, receiverCountry: r.country, receiverAddress: r.address, receiverPlaceOfIssue: r.placeOfIssue, receiverBankName: r.bankName, receiverAccountNumber: r.accountNumber, receiverBranch: r.branch, receiverRoutingNumber: r.routingNumber, receiverPickupNetwork: r.pickupNetwork, receiverIdType: r.idType, receiverIdNumber: r.idNumber, receiverPickupCity: r.pickupCity, receiverWalletProvider: r.walletProvider, receiverWalletNumber: r.walletNumber })}/>) }<OutlineButton label="+ Add a new receiver instead" onPress={() => updateServiceData({ receiverMode: 'new' })}/></View>;
}

function ReceiverPreview({ serviceData }) {
  const method = serviceData.method; const name = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
  const rows = [{ label: 'Name', value: name || '-' }, { label: 'Relationship', value: serviceData.receiverRelationship || '-' }, { label: 'Mobile', value: serviceData.receiverPhone || '-' }, { label: 'Address', value: serviceData.receiverAddress || '-' }, { label: 'Place of Issue', value: serviceData.receiverPlaceOfIssue || '-' }];
  if (method === 'deposit') rows.push({ label: 'Bank', value: serviceData.receiverBankName || '-' }, { label: 'Account No.', value: serviceData.receiverAccountNumber || '-' }, { label: 'Branch', value: serviceData.receiverBranch || '-' }, { label: 'Routing No.', value: serviceData.receiverRoutingNumber || '-' });
  if (method === 'cash') rows.push({ label: 'Pickup Network', value: serviceData.receiverPickupNetwork || '-' }, { label: 'ID', value: serviceData.receiverIdType ? `${serviceData.receiverIdType} - ${serviceData.receiverIdNumber || ''}` : '-' }, { label: 'Pickup City', value: serviceData.receiverPickupCity || '-' });
  if (method === 'ewallet') rows.push({ label: 'Wallet Provider', value: serviceData.receiverWalletProvider || '-' }, { label: 'Wallet Number', value: serviceData.receiverWalletNumber || '-' });
  return <SummaryCard title="👤 Receiver Information Preview" rows={rows}/>;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a destination country.';
  if (step === 1 && !serviceData.method) return 'Please select a receiving method.';
  if (step === 2 && !serviceData.paymentMethod) return 'Please select a payment method.';
  if (step === 3 && !(serviceData.sendAmt > 0)) return 'Please enter an amount to send.';
  if (step === 4) {
    if (serviceData.receiverMode === 'new') {
      if (!(serviceData.receiverFirstName || '').trim()) return "Please enter the receiver's first name.";
      if (!(serviceData.receiverLastName || '').trim()) return "Please enter the receiver's last name.";
      if (!(serviceData.receiverRelationship || '').trim()) return "Please select the receiver's relationship to you.";
      if (!(serviceData.receiverPhone || '').trim()) return "Please enter the receiver's mobile number.";
      if (!(serviceData.receiverAddress || '').trim()) return "Please enter the receiver's address.";
      if (serviceData.method === 'deposit') { if (!(serviceData.receiverBankName || '').trim()) return 'Please select the receiving bank.'; if (!(serviceData.receiverAccountNumber || '').trim()) return "Please enter the receiver's account number."; if (!(serviceData.receiverBranch || '').trim()) return 'Please select the bank branch.'; }
      else if (serviceData.method === 'cash') { if (!(serviceData.receiverPickupNetwork || '').trim()) return 'Please select a cash pickup network.'; if (!(serviceData.receiverIdType || '').trim()) return "Please select the receiver's ID type."; if (!(serviceData.receiverIdNumber || '').trim()) return "Please enter the receiver's ID number."; if (!(serviceData.receiverPickupCity || '').trim()) return 'Please enter the pickup city.'; }
      else if (serviceData.method === 'ewallet') { if (!(serviceData.receiverWalletProvider || '').trim()) return 'Please select an eWallet provider.'; if (!(serviceData.receiverWalletNumber || '').trim()) return "Please enter the receiver's wallet number."; }
    } else if (serviceData.receiverMode === 'saved') { if (!serviceData.selectedReceiverId) return 'Please select a saved receiver.'; }
    else return 'Please add a new receiver or select a saved one.';
  }
  if (step === 5) {
    if (!(serviceData.senderName || '').trim()) return "Please enter the sender's full name.";
    if (!(serviceData.senderPhone || '').trim()) return "Please enter the sender's mobile number.";
    if (!(serviceData.senderPassportNo || '').trim()) return "Please enter the sender's passport number.";
    if (!(serviceData.senderPassportIssuePlace || '').trim()) return "Please enter the passport place of issue.";
    if (!(serviceData.senderPassportIssueDate || '').trim()) return "Please select the passport issue date.";
    if (!(serviceData.senderPassportExpiry || '').trim()) return "Please select the sender's passport expiry date.";
    if (!(serviceData.senderAddress || '').trim()) return "Please enter the sender's address.";
    if (!serviceData.passportLocalUri) return "Please capture or upload the sender's passport photo.";
    if (!serviceData.passportUrl) return 'Still uploading the passport photo - please wait a moment.';
  }
  return null;
}

function createStyles(colors) { return StyleSheet.create({ favoriteRow:{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'white',padding:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,marginBottom:14 }, favoriteLabel:{ fontSize:14,fontWeight:'600',color:colors.text }, emptyText:{ color:'#999',textAlign:'center',marginVertical:20 }, uploadBox:{ width:'100%',minHeight:140,borderWidth:2,borderColor:'#CCC',borderStyle:'dashed',borderRadius:radius.md,alignItems:'center',justifyContent:'center',overflow:'hidden',marginBottom:4,backgroundColor:'white' }, uploadIcon:{ fontSize:26,marginBottom:6 }, uploadText:{ color:'#999',fontSize:13,textAlign:'center',paddingHorizontal:20 }, passportPreview:{ width:'100%',height:180 }, uploadOverlay:{ ...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.35)',alignItems:'center',justifyContent:'center' }, changePassport:{ color:colors.primary,fontSize:12,fontWeight:'600',marginTop:6,marginBottom:10 } }); }
