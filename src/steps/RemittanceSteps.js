import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import { FormLabel, Grid3, SelectCard, FormInput, SearchPicker, MethodCard, TxOptionCard, SummaryCard } from '../components/ui';
import RemittanceReceiverStep from './RemittanceReceiverStep';
import ConsentCheckbox from '../components/ConsentCheckbox';

const DEFAULT_FEE = 7.0;
const PROCESSING_TIME = '15 minutes – 3 days';
const RECEIVING_METHODS = [
  { key:'deposit', icon:'🏦', bg:'#E3F2FD', name:'Bank Account', speed:'2-3 business days' },
  { key:'cash', icon:'💵', bg:'#E8F5E9', name:'Cash Pickup', speed:'Usually within minutes' },
  { key:'ewallet', icon:'📱', bg:'#FFF3E0', name:'eWallet', speed:'Usually within minutes' },
];
const PAYMENT_METHODS = [
  { key:'ewallet', label:'eWallet' }, { key:'fpx', label:'FPX' }, { key:'debit', label:'Debit Card' }, { key:'cash', label:'Pay in Cash' },
];
const PURPOSE_OPTIONS = ['Family Support','Living Expenses','Education','Medical Expenses','Salary / Income Transfer','Savings','Business','Property / Investment','Emergency Expenses','Other'];

function getRate(country, method, rates) {
  if (country === 'BD') return method === 'deposit' ? (rates.BD_ACC || 30.26) : (rates.BD_CASH || 30.11);
  return rates[country] || 30.26;
}

export default function RemittanceStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates, authUser, profile } = useApp();
  const curr = (countries.find((c) => c.code === serviceData.country) || {}).curr || '';
  const destinationCountries = countries.filter((c) => c.code !== 'MY');

  useEffect(() => {
    const senderName = profile?.name || profile?.displayName || '';
    const senderPhone = profile?.phone || authUser?.phoneNumber || '';
    const customerId = profile?.customerId || '';
    const patch = {};
    if (senderName && serviceData.senderName !== senderName) patch.senderName = senderName;
    if (senderPhone && serviceData.senderPhone !== senderPhone) patch.senderPhone = senderPhone;
    if (customerId && serviceData.customerId !== customerId) patch.customerId = customerId;
    if (Object.keys(patch).length) updateServiceData(patch);
  }, [profile?.name, profile?.displayName, profile?.phone, profile?.customerId, authUser?.phoneNumber]);

  if (step === 0) return <View><FormLabel>Select Destination Country</FormLabel><Grid3>{destinationCountries.map((c) => <SelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country:c.code }); nextStep(); }} />)}</Grid3></View>;

  if (step === 1) return <View><FormLabel>Select Receiving Method</FormLabel><Text style={{ color:'#6B7280', fontSize:12, marginBottom:10 }}>Processing time: {PROCESSING_TIME}</Text>{RECEIVING_METHODS.map((m) => { const rate = getRate(serviceData.country, m.key, rates); return <MethodCard key={m.key} icon={m.icon} bg={m.bg} name={m.name} detail={`${m.speed}  •  1.00 MYR = ${rate} ${curr}`} onPress={() => { updateServiceData({ method:m.key, receivingRate:rate, receivingSpeed:m.speed }); nextStep(); }} />; })}</View>;

  if (step === 2) { const fee = rates.remittanceFee != null ? rates.remittanceFee : DEFAULT_FEE; return <View><FormLabel>Select Payment Method</FormLabel>{PAYMENT_METHODS.map((p) => <TxOptionCard key={p.key} title={p.label} detail={`Transfer Fee: ${fee.toFixed(2)} MYR`} selected={serviceData.paymentMethod === p.key} onPress={() => { updateServiceData({ paymentMethod:p.key, transferFee:fee }); nextStep(); }} />)}</View>; }

  if (step === 3) { const rate = serviceData.receivingRate || 30.26; const fee = serviceData.transferFee != null ? serviceData.transferFee : (rates.remittanceFee != null ? rates.remittanceFee : DEFAULT_FEE); const sendAmt = Number(serviceData.sendAmt || 0); const total = sendAmt + fee; const recAmt = sendAmt * rate; return <View><FormLabel>Transfer Amount</FormLabel><Text style={{ color:'#6B7280', fontSize:12, marginBottom:8 }}>Enter the amount you want to send in MYR.</Text><FormInput keyboardType="numeric" placeholder="0.00 MYR" value={serviceData.sendAmt != null ? String(serviceData.sendAmt) : ''} onChangeText={(v) => updateServiceData({ sendAmt:parseFloat(v) || 0 })}/><SummaryCard title="Transfer Summary" rows={[{label:'You Send',value:`${sendAmt.toFixed(2)} MYR`},{label:'Exchange Rate',value:`1.00 MYR = ${rate} ${curr}`},{label:'Transfer Fee',value:`${fee.toFixed(2)} MYR`},{label:'Total Charged',value:`${total.toFixed(2)} MYR`}]} totalLabel="Recipient Gets" totalValue={`${recAmt.toFixed(2)} ${curr}`} /></View>; }

  if (step === 4) return <RemittanceReceiverStep serviceData={serviceData} updateServiceData={updateServiceData} authUser={authUser} profile={profile}/>;
  if (step === 5) return (<>
    <SenderDetails serviceData={serviceData} updateServiceData={updateServiceData} profile={profile} authUser={authUser}/>
    {/* The last step before a transfer carrying both parties' passport and
        address details is sent. The charge refuses it without this. */}
    <ConsentCheckbox purpose="remittance" value={!!serviceData.consentAccepted}
      onChange={(v) => updateServiceData({ consentAccepted: v })} />
  </>);
  if (step === 6) return <FinalReview serviceData={serviceData} profile={profile} curr={curr}/>;
  return null;
}

function SenderDetails({ serviceData, updateServiceData, profile, authUser }) {
  const name = serviceData.senderName || profile?.name || profile?.displayName || '';
  const phone = serviceData.senderPhone || profile?.phone || authUser?.phoneNumber || '';
  return <View><FormLabel>Sender Information</FormLabel><Text style={{ color:'#6B7280', fontSize:12, lineHeight:18, marginBottom:12 }}>Your verified account details are used automatically. You do not need to enter your identity documents again.</Text><View style={{ padding:14, borderRadius:12, borderWidth:1, borderColor:'#D1D5DB', marginBottom:14 }}><Text style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Verified sender</Text><Text style={{ fontSize:16, fontWeight:'700', marginBottom:4 }}>{name || 'Account holder'}</Text><Text style={{ fontSize:13, color:'#6B7280' }}>{phone || 'Verified phone'}</Text>{!!profile?.customerId && <Text style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>Customer ID: {profile.customerId}</Text>}</View><FormLabel>Purpose of Remittance</FormLabel><SearchPicker placeholder="Select purpose" title="Select Purpose of Remittance" value={serviceData.purpose} items={PURPOSE_OPTIONS} searchable={false} onSelect={(v) => updateServiceData({ purpose:v })}/></View>;
}

function FinalReview({ serviceData, profile, curr }) {
  const rate = serviceData.receivingRate || 30.26;
  const fee = serviceData.transferFee != null ? serviceData.transferFee : DEFAULT_FEE;
  const sendAmt = Number(serviceData.sendAmt || 0); const total = sendAmt + fee; const recAmt = sendAmt * rate;
  const methodLabel = (RECEIVING_METHODS.find((m) => m.key === serviceData.method) || {}).name || '';
  const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
  const rows = [
    {label:'Payout Country', value:serviceData.country || ''}, {label:'Receiving Method', value:methodLabel}, {label:'Payment Method', value:serviceData.paymentMethod || ''},
    {label:'Sender', value:serviceData.senderName || profile?.name || ''}, {label:'Sender Mobile', value:serviceData.senderPhone || profile?.phone || ''}, {label:'Purpose', value:serviceData.purpose || ''},
    {label:'Recipient Type', value:serviceData.recipientType === 'self' ? 'Myself' : 'Someone else'}, {label:'Receiver', value:receiverName}, {label:'Receiver Mobile', value:serviceData.receiverPhone || ''}, {label:'Relationship', value:serviceData.receiverRelationship || ''},
  ];
  if (serviceData.receiverNationality) rows.push({label:'Receiver Nationality', value:serviceData.receiverNationality});
  if (serviceData.receiverDateOfBirth) rows.push({label:'Receiver Date of Birth', value:serviceData.receiverDateOfBirth});
  if (serviceData.receiverAddress) rows.push({label:'Receiver Address', value:serviceData.receiverAddress});
  if (serviceData.receiverIdType && serviceData.receiverIdNumber) rows.push({label:'Receiver ID', value:`${serviceData.receiverIdType} ${serviceData.receiverIdNumber}`.trim()});
  if (serviceData.method === 'deposit') rows.push({label:'Bank', value:serviceData.receiverBankName || ''},{label:'Account No.', value:serviceData.receiverAccountNumber || ''},{label:'Branch', value:serviceData.receiverBranch || ''});
  if (serviceData.method === 'cash') rows.push({label:'Pickup Network', value:serviceData.receiverPickupNetwork || ''},{label:'Pickup City', value:serviceData.receiverPickupCity || ''});
  if (serviceData.method === 'ewallet') rows.push({label:'Wallet Provider', value:serviceData.receiverWalletProvider || ''},{label:'Wallet Number', value:serviceData.receiverWalletNumber || ''});
  rows.push({label:'Processing Time', value:PROCESSING_TIME},{label:'Transfer Amount', value:`${sendAmt.toFixed(2)} MYR`},{label:'Service Charge', value:`${fee.toFixed(2)} MYR`},{label:'Exchange Rate', value:`1 MYR = ${rate} ${curr}`},{label:'Receive Amount', value:`${recAmt.toFixed(2)} ${curr}`});
  return <View><SummaryCard title="Final Remittance Review" rows={rows} totalLabel="Collected Amount" totalValue={`${total.toFixed(2)} MYR`}/></View>;
}

export function validateStep(step, serviceData) {
  if (step===0 && !serviceData.country) return 'Please select a destination country.';
  if (step===1 && !serviceData.method) return 'Please select a receiving method.';
  if (step===2 && !serviceData.paymentMethod) return 'Please select a payment method.';
  if (step===3 && !(serviceData.sendAmt>0)) return 'Please enter an amount to send.';
  if (step===4) {
    if (!serviceData.recipientType) return 'Please choose whether you are sending to yourself or someone else.';
    if (serviceData.recipientType === 'self') {
      if (!(serviceData.receiverFirstName||'').trim() || !(serviceData.receiverLastName||'').trim()) return 'Your verified KYC name is required.';
      if (!(serviceData.receiverPhone||'').trim()) return 'Your verified phone number is required.';
    } else {
      if (!(serviceData.receiverFirstName||'').trim()) return "Please enter the receiver's first name.";
      if (!(serviceData.receiverLastName||'').trim()) return "Please enter the receiver's last name.";
      if (!(serviceData.receiverRelationship||'').trim()) return "Please select the receiver's relationship to you.";
      if (!(serviceData.receiverPhone||'').trim()) return "Please enter the receiver's mobile number.";
      if (!(serviceData.receiverNationality||'').trim()) return "Please select the receiver's nationality.";
      if (!(serviceData.receiverDateOfBirth||'').trim()) return "Please enter the receiver's date of birth.";
      if (!(serviceData.receiverAddress||'').trim()) return "Please enter the receiver's residential address.";
      if (serviceData.method==='cash') {
        if (!(serviceData.receiverIdType||'').trim()) return "Please select the receiver's ID type.";
        if (!(serviceData.receiverIdNumber||'').trim()) return "Please enter the receiver's ID number.";
      }
    }
    if (serviceData.method==='deposit') { if (!(serviceData.receiverBankName||'').trim()) return 'Please select the receiving bank.'; if (!(serviceData.receiverAccountNumber||'').trim()) return "Please enter the receiver's account number."; if (!(serviceData.receiverBranch||'').trim()) return 'Please select the bank branch.'; }
    if (serviceData.method==='cash') { if (!(serviceData.receiverPickupNetwork||'').trim()) return 'Please select a cash pickup network.'; if (!(serviceData.receiverPickupCity||'').trim()) return 'Please enter the pickup city.'; }
    if (serviceData.method==='ewallet') { if (!(serviceData.receiverWalletProvider||'').trim()) return 'Please select an eWallet provider.'; if (!(serviceData.receiverWalletNumber||'').trim()) return "Please enter the receiver's wallet number."; }
  }
  if (step===5) { if (!(serviceData.senderName||'').trim()) return 'Your verified sender name is missing. Please update your profile first.'; if (!(serviceData.senderPhone||'').trim()) return 'Your verified phone number is missing. Please verify your phone first.'; if (!(serviceData.purpose||'').trim()) return 'Please select the purpose of the remittance.'; if (serviceData.consentAccepted !== true) return 'Please tick the box to continue.'; }
  return null;
}
