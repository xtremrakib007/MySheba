// Supporting lookup data for the Remittance wizard's receiver step.
// Keyed by destination country code (matches `countries.js` -> `code`),
// so the bank / branch / eWallet / cash-pickup pickers only ever show
// options relevant to the country the customer picked on Step 1.
import { bdBanks } from './bdBanks';

// Bank -> its branch network, per country. BD uses the real Bangladesh
// Bank routing-number directory (bdBanks.js) - each branch there is an
// object ({ name, subtitle: city, routing }) so the Branch picker can
// auto-fill the Routing Number field. Every other country's branches are
// illustrative (major-city coverage) rather than an exhaustive real-world
// branch list, and has no routing numbers of its own.
export const banksByCountry = {
  BD: bdBanks,
  IN: [
    { name: 'State Bank of India (SBI)', branches: ['Mumbai Main Branch', 'Delhi Connaught Place', 'Bengaluru MG Road', 'Chennai Anna Nagar', 'Kolkata Park Street'] },
    { name: 'HDFC Bank', branches: ['Mumbai Fort Branch', 'Delhi Karol Bagh', 'Bengaluru Koramangala', 'Hyderabad Banjara Hills', 'Pune Camp Branch'] },
    { name: 'ICICI Bank', branches: ['Mumbai Andheri', 'Delhi Saket', 'Chennai T Nagar', 'Kochi MG Road', 'Ahmedabad C G Road'] },
    { name: 'Punjab National Bank', branches: ['Delhi Chandni Chowk', 'Amritsar Mall Road', 'Lucknow Hazratganj', 'Patna Branch'] },
    { name: 'Axis Bank', branches: ['Mumbai Bandra', 'Delhi Nehru Place', 'Bengaluru Indiranagar', 'Jaipur MI Road'] },
  ],
  NP: [
    { name: 'Nepal Bank', branches: ['Kathmandu New Road', 'Pokhara Branch', 'Biratnagar Branch', 'Butwal Branch'] },
    { name: 'Nabil Bank', branches: ['Kathmandu Durbar Marg', 'Lalitpur Branch', 'Pokhara Branch', 'Chitwan Branch'] },
    { name: 'Rastriya Banijya Bank', branches: ['Kathmandu Singha Durbar', 'Biratnagar Branch', 'Dharan Branch'] },
    { name: 'Global IME Bank', branches: ['Kathmandu Naxal', 'Pokhara Branch', 'Butwal Branch', 'Birgunj Branch'] },
    { name: 'NIC Asia Bank', branches: ['Kathmandu Thamel', 'Bhaktapur Branch', 'Pokhara Branch'] },
  ],
  ID: [
    { name: 'Bank Central Asia (BCA)', branches: ['Jakarta Thamrin', 'Surabaya Branch', 'Bandung Branch', 'Medan Branch'] },
    { name: 'Bank Mandiri', branches: ['Jakarta Sudirman', 'Denpasar Branch', 'Semarang Branch', 'Makassar Branch'] },
    { name: 'Bank Rakyat Indonesia (BRI)', branches: ['Jakarta Kuningan', 'Yogyakarta Branch', 'Malang Branch', 'Palembang Branch'] },
    { name: 'Bank Negara Indonesia (BNI)', branches: ['Jakarta Kebayoran', 'Surabaya Branch', 'Batam Branch'] },
  ],
  PK: [
    { name: 'Habib Bank (HBL)', branches: ['Karachi I.I. Chundrigar', 'Lahore Mall Road', 'Islamabad Blue Area', 'Faisalabad Branch'] },
    { name: 'United Bank (UBL)', branches: ['Karachi Clifton', 'Lahore Gulberg', 'Rawalpindi Branch', 'Multan Branch'] },
    { name: 'MCB Bank', branches: ['Karachi Saddar', 'Lahore Model Town', 'Peshawar Branch'] },
    { name: 'Allied Bank', branches: ['Karachi Branch', 'Lahore Branch', 'Sialkot Branch'] },
    { name: 'Bank Alfalah', branches: ['Karachi Branch', 'Lahore Branch', 'Islamabad Branch'] },
  ],
  MM: [
    { name: 'KBZ Bank', branches: ['Yangon Main Branch', 'Mandalay Branch', 'Naypyidaw Branch'] },
    { name: 'AYA Bank', branches: ['Yangon Branch', 'Mandalay Branch', 'Bago Branch'] },
    { name: 'CB Bank', branches: ['Yangon Branch', 'Taunggyi Branch'] },
  ],
  PH: [
    { name: 'BDO Unibank', branches: ['Manila Ayala', 'Cebu Branch', 'Davao Branch', 'Quezon City Branch'] },
    { name: 'Bank of the Philippine Islands (BPI)', branches: ['Makati Branch', 'Cebu Branch', 'Baguio Branch'] },
    { name: 'Metrobank', branches: ['Manila Branch', 'Cebu Branch', 'Davao Branch'] },
    { name: 'Landbank', branches: ['Manila Branch', 'Iloilo Branch', 'Cagayan de Oro Branch'] },
  ],
  KH: [
    { name: 'ACLEDA Bank', branches: ['Phnom Penh Main Branch', 'Siem Reap Branch', 'Battambang Branch'] },
    { name: 'Canadia Bank', branches: ['Phnom Penh Branch', 'Sihanoukville Branch'] },
    { name: 'ABA Bank', branches: ['Phnom Penh Branch', 'Siem Reap Branch'] },
  ],
  MY: [
    { name: 'Maybank', branches: ['Kuala Lumpur Main Branch', 'Penang Branch', 'Johor Bahru Branch'] },
    { name: 'CIMB Bank', branches: ['Kuala Lumpur Branch', 'Ipoh Branch', 'Malacca Branch'] },
    { name: 'Public Bank', branches: ['Kuala Lumpur Branch', 'Penang Branch'] },
  ],
};

// eWallet providers most commonly used in each destination country.
export const ewalletsByCountry = {
  BD: ['bKash', 'Nagad', 'Rocket', 'Upay'],
  IN: ['Paytm', 'PhonePe', 'Google Pay', 'Amazon Pay'],
  NP: ['eSewa', 'Khalti', 'IME Pay'],
  ID: ['GoPay', 'OVO', 'DANA', 'ShopeePay'],
  PK: ['JazzCash', 'Easypaisa', 'NayaPay'],
  MM: ['Wave Money', 'KBZPay', 'OK Dollar'],
  PH: ['GCash', 'Maya', "Coins.ph"],
  KH: ['Wing', 'Pi Pay', 'TrueMoney'],
  MY: ['Touch n Go eWallet', 'GrabPay', 'Boost'],
};

// Cash pickup partner networks per destination country.
export const cashPickupByCountry = {
  BD: ['Sonali Bank Agent Network', 'Western Union Agent', 'MoneyGram Agent', 'bKash Cash Point'],
  IN: ['Western Union Agent', 'MoneyGram Agent', 'UAE Exchange Agent'],
  NP: ['IME Cash Point', 'Prabhu Money Transfer Agent', 'Western Union Agent'],
  ID: ['Western Union Agent', 'PT Pos Indonesia Agent', 'MoneyGram Agent'],
  PK: ['Western Union Agent', 'MoneyGram Agent', 'UBL Cash Point'],
  MM: ['Western Union Agent', 'KBZ Cash Point'],
  PH: ['Western Union Agent', 'Cebuana Lhuillier', 'Palawan Express'],
  KH: ['Wing Cash Point', 'Western Union Agent'],
  MY: ['Western Union Agent (MY)'],
};

export const RELATIONSHIPS = [
  'Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister',
  'Relative', 'Friend', 'Employer', 'Other',
];

export const ID_TYPES = ['National ID', 'Passport', "Driver's License", 'Voter ID'];
