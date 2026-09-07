// Major international airports grouped by country, used for the Flight
// From/To pickers. `name` includes the airport name and IATA code so it's
// searchable by either. Grouped by country for the picker section/subtitle,
// same pattern as malaysianCities (state -> here it's country).
export const airports = [
  // Malaysia
  { id: 'kul', name: 'Kuala Lumpur Intl (KUL)', country: 'Malaysia' },
  { id: 'sub', name: 'Sultan Abdul Aziz Shah, Subang (SZB)', country: 'Malaysia' },
  { id: 'pen', name: 'Penang Intl (PEN)', country: 'Malaysia' },
  { id: 'jhb', name: 'Senai Intl, Johor Bahru (JHB)', country: 'Malaysia' },
  { id: 'lgk', name: 'Langkawi Intl (LGK)', country: 'Malaysia' },
  { id: 'bki', name: 'Kota Kinabalu Intl (BKI)', country: 'Malaysia' },
  { id: 'kch', name: 'Kuching Intl (KCH)', country: 'Malaysia' },

  // Bangladesh
  { id: 'dac', name: 'Hazrat Shahjalal Intl, Dhaka (DAC)', country: 'Bangladesh' },
  { id: 'cgp', name: 'Shah Amanat Intl, Chittagong (CGP)', country: 'Bangladesh' },
  { id: 'zyl', name: 'Osmani Intl, Sylhet (ZYL)', country: 'Bangladesh' },

  // India
  { id: 'del', name: 'Indira Gandhi Intl, Delhi (DEL)', country: 'India' },
  { id: 'bom', name: 'Chhatrapati Shivaji Maharaj Intl, Mumbai (BOM)', country: 'India' },
  { id: 'maa', name: 'Chennai Intl (MAA)', country: 'India' },
  { id: 'ccu', name: 'Netaji Subhas Chandra Bose Intl, Kolkata (CCU)', country: 'India' },
  { id: 'blr', name: 'Kempegowda Intl, Bengaluru (BLR)', country: 'India' },
  { id: 'hyd', name: 'Rajiv Gandhi Intl, Hyderabad (HYD)', country: 'India' },
  { id: 'cok', name: 'Cochin Intl, Kochi (COK)', country: 'India' },

  // Indonesia
  { id: 'cgk', name: 'Soekarno-Hatta Intl, Jakarta (CGK)', country: 'Indonesia' },
  { id: 'dps', name: 'Ngurah Rai Intl, Denpasar/Bali (DPS)', country: 'Indonesia' },
  { id: 'sub_id', name: 'Juanda Intl, Surabaya (SUB)', country: 'Indonesia' },
  { id: 'mdn', name: 'Kualanamu Intl, Medan (KNO)', country: 'Indonesia' },

  // Pakistan
  { id: 'khi', name: 'Jinnah Intl, Karachi (KHI)', country: 'Pakistan' },
  { id: 'lhe', name: 'Allama Iqbal Intl, Lahore (LHE)', country: 'Pakistan' },
  { id: 'isb', name: 'Islamabad Intl (ISB)', country: 'Pakistan' },

  // Nepal
  { id: 'ktm', name: 'Tribhuvan Intl, Kathmandu (KTM)', country: 'Nepal' },

  // Sri Lanka
  { id: 'cmb', name: 'Bandaranaike Intl, Colombo (CMB)', country: 'Sri Lanka' },

  // Myanmar
  { id: 'rgn', name: 'Yangon Intl (RGN)', country: 'Myanmar' },
  { id: 'mdl', name: 'Mandalay Intl (MDL)', country: 'Myanmar' },

  // Philippines
  { id: 'mnl', name: 'Ninoy Aquino Intl, Manila (MNL)', country: 'Philippines' },
  { id: 'ceb', name: 'Mactan-Cebu Intl (CEB)', country: 'Philippines' },
  { id: 'dvo', name: 'Francisco Bangoy Intl, Davao (DVO)', country: 'Philippines' },

  // Vietnam
  { id: 'sgn', name: 'Tan Son Nhat Intl, Ho Chi Minh City (SGN)', country: 'Vietnam' },
  { id: 'han', name: 'Noi Bai Intl, Hanoi (HAN)', country: 'Vietnam' },
  { id: 'dad', name: 'Da Nang Intl (DAD)', country: 'Vietnam' },

  // Thailand
  { id: 'bkk', name: 'Suvarnabhumi, Bangkok (BKK)', country: 'Thailand' },
  { id: 'dmk', name: 'Don Mueang Intl, Bangkok (DMK)', country: 'Thailand' },
  { id: 'hkt', name: 'Phuket Intl (HKT)', country: 'Thailand' },
  { id: 'cnx', name: 'Chiang Mai Intl (CNX)', country: 'Thailand' },

  // Singapore
  { id: 'sin', name: 'Changi Intl (SIN)', country: 'Singapore' },

  // China
  { id: 'pek', name: 'Beijing Capital Intl (PEK)', country: 'China' },
  { id: 'pvg', name: 'Shanghai Pudong Intl (PVG)', country: 'China' },
  { id: 'can', name: 'Guangzhou Baiyun Intl (CAN)', country: 'China' },
  { id: 'szx', name: 'Shenzhen Bao\'an Intl (SZX)', country: 'China' },

  // Hong Kong
  { id: 'hkg', name: 'Hong Kong Intl (HKG)', country: 'Hong Kong' },

  // Taiwan
  { id: 'tpe', name: 'Taiwan Taoyuan Intl (TPE)', country: 'Taiwan' },

  // Japan
  { id: 'nrt', name: 'Narita Intl, Tokyo (NRT)', country: 'Japan' },
  { id: 'hnd', name: 'Haneda, Tokyo (HND)', country: 'Japan' },
  { id: 'kix', name: 'Kansai Intl, Osaka (KIX)', country: 'Japan' },

  // South Korea
  { id: 'icn', name: 'Incheon Intl, Seoul (ICN)', country: 'South Korea' },
  { id: 'gmp', name: 'Gimpo Intl, Seoul (GMP)', country: 'South Korea' },

  // Middle East
  { id: 'dxb', name: 'Dubai Intl (DXB)', country: 'United Arab Emirates' },
  { id: 'auh', name: 'Abu Dhabi Intl (AUH)', country: 'United Arab Emirates' },
  { id: 'doh', name: 'Hamad Intl, Doha (DOH)', country: 'Qatar' },
  { id: 'ruh', name: 'King Khalid Intl, Riyadh (RUH)', country: 'Saudi Arabia' },
  { id: 'jed', name: 'King Abdulaziz Intl, Jeddah (JED)', country: 'Saudi Arabia' },
  { id: 'med', name: 'Prince Mohammad Bin Abdulaziz, Madinah (MED)', country: 'Saudi Arabia' },
  { id: 'kwi', name: 'Kuwait Intl (KWI)', country: 'Kuwait' },
  { id: 'bah', name: 'Bahrain Intl (BAH)', country: 'Bahrain' },
  { id: 'muc_om', name: 'Muscat Intl (MCT)', country: 'Oman' },
  { id: 'amm', name: 'Queen Alia Intl, Amman (AMM)', country: 'Jordan' },

  // Australia
  { id: 'syd', name: 'Sydney Kingsford Smith (SYD)', country: 'Australia' },
  { id: 'mel', name: 'Melbourne (MEL)', country: 'Australia' },
  { id: 'per', name: 'Perth (PER)', country: 'Australia' },
  { id: 'bne', name: 'Brisbane (BNE)', country: 'Australia' },

  // United Kingdom
  { id: 'lhr', name: 'Heathrow, London (LHR)', country: 'United Kingdom' },
  { id: 'lgw', name: 'Gatwick, London (LGW)', country: 'United Kingdom' },
  { id: 'man', name: 'Manchester (MAN)', country: 'United Kingdom' },

  // Europe
  { id: 'cdg', name: 'Charles de Gaulle, Paris (CDG)', country: 'France' },
  { id: 'ams', name: 'Amsterdam Schiphol (AMS)', country: 'Netherlands' },
  { id: 'fra', name: 'Frankfurt (FRA)', country: 'Germany' },
  { id: 'muc', name: 'Munich (MUC)', country: 'Germany' },
  { id: 'ist', name: 'Istanbul (IST)', country: 'Turkey' },
  { id: 'fco', name: 'Leonardo da Vinci, Rome (FCO)', country: 'Italy' },
  { id: 'mad', name: 'Adolfo Suarez Madrid-Barajas (MAD)', country: 'Spain' },

  // United States
  { id: 'jfk', name: 'John F. Kennedy Intl, New York (JFK)', country: 'United States' },
  { id: 'lax', name: 'Los Angeles Intl (LAX)', country: 'United States' },
  { id: 'ord', name: 'O\'Hare Intl, Chicago (ORD)', country: 'United States' },
  { id: 'sfo', name: 'San Francisco Intl (SFO)', country: 'United States' },

  // Canada
  { id: 'yyz', name: 'Toronto Pearson Intl (YYZ)', country: 'Canada' },
  { id: 'yvr', name: 'Vancouver Intl (YVR)', country: 'Canada' },

  // Africa
  { id: 'cai', name: 'Cairo Intl (CAI)', country: 'Egypt' },
  { id: 'jnb', name: 'O.R. Tambo Intl, Johannesburg (JNB)', country: 'South Africa' },
  { id: 'los', name: 'Murtala Muhammed Intl, Lagos (LOS)', country: 'Nigeria' },
  { id: 'nbo', name: 'Jomo Kenyatta Intl, Nairobi (NBO)', country: 'Kenya' },
];
