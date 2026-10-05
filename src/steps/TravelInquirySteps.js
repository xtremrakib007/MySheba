import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { FormLabel, FormInput, CityPicker, AirportPicker, DateField, TimeField, SummaryCard } from '../components/ui';
import { malaysianCities } from '../data/cities';
import { airports } from '../data/airports';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";
import ConsentCheckbox from '../components/ConsentCheckbox';

// Shared by FlightSteps / BusSteps / TrainSteps. All three are simple
// "send an inquiry to Admin" forms - no live inventory or pricing, since a
// human always confirms availability and price by phone.
//
// Step 0: From / To / Date (+ Time for bus & train) / Passengers
// Step 1: Contact details (name, phone, email, notes)
// Step 2: Summary + Submit
export default function TravelInquirySteps({ step, hasTime, icon, routeLabel }) {
  const { serviceData, updateServiceData } = useApp();

  if (step === 0) {
    return (
      <View>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            {icon} Tell us your trip details - our admin team will check availability and price, then contact you directly.
          </Text>
        </View>

        <FormLabel>{routeLabel} From</FormLabel>
        {routeLabel === 'Flight' ? (
          <AirportPicker
            placeholder="Select departure airport"
            value={serviceData.from || ''}
            onSelect={(v) => updateServiceData({ from: v })}
            airports={airports}
          />
        ) : (
          <CityPicker
            placeholder="Select departure city"
            value={serviceData.from || ''}
            onSelect={(v) => updateServiceData({ from: v })}
            cities={malaysianCities}
          />
        )}

        <FormLabel>{routeLabel} To</FormLabel>
        {routeLabel === 'Flight' ? (
          <AirportPicker
            placeholder="Select destination airport"
            value={serviceData.to || ''}
            onSelect={(v) => updateServiceData({ to: v })}
            airports={airports}
          />
        ) : (
          <CityPicker
            placeholder="Select destination city"
            value={serviceData.to || ''}
            onSelect={(v) => updateServiceData({ to: v })}
            cities={malaysianCities}
          />
        )}

        <FormLabel>Travel Date</FormLabel>
        <DateField
          placeholder="Select travel date"
          value={serviceData.date || ''}
          onChange={(v) => updateServiceData({ date: v })}
          minimumDate={new Date()}
        />

        {!!hasTime && (
          <>
            <FormLabel>Preferred Time (optional)</FormLabel>
            <TimeField
              placeholder="Select preferred time"
              value={serviceData.time || ''}
              onChange={(v) => updateServiceData({ time: v })}
            />
          </>
        )}

        <FormLabel>Number of Passengers</FormLabel>
        <FormInput
          placeholder="1"
          keyboardType="number-pad"
          value={serviceData.passengers != null ? String(serviceData.passengers) : ''}
          onChangeText={(v) => updateServiceData({ passengers: parseInt(v, 10) || 1 })}
        />
      </View>
    );
  }

  if (step === 1) {
    return (
      <View>
        <FormLabel>Full Name</FormLabel>
        <FormInput
          placeholder="Full name"
          value={serviceData.pName || ''}
          onChangeText={(v) => updateServiceData({ pName: v })}
        />
        <FormLabel>Mobile Number</FormLabel>
        <FormInput
          placeholder="Phone number"
          keyboardType="phone-pad"
          value={serviceData.pPhone || ''}
          onChangeText={(v) => updateServiceData({ pPhone: v })}
        />
        <FormLabel>Email (optional)</FormLabel>
        <FormInput
          placeholder="Email"
          keyboardType="email-address"
          value={serviceData.pEmail || ''}
          onChangeText={(v) => updateServiceData({ pEmail: v })}
        />
        <FormLabel>Notes (optional)</FormLabel>
        <FormInput
          placeholder="Anything else admin should know"
          value={serviceData.pNotes || ''}
          onChangeText={(v) => updateServiceData({ pNotes: v })}
        />
      </View>
    );
  }

  if (step === 2) {
    const rows = [
      { label: 'Route', value: `${serviceData.from || '-'} → ${serviceData.to || '-'}` },
      { label: 'Date', value: serviceData.date || '-' },
    ];
    if (hasTime) rows.push({ label: 'Time', value: serviceData.time || 'Any' });
    rows.push({ label: 'Passengers', value: String(serviceData.passengers || 1) });
    rows.push({ label: 'Contact', value: `${serviceData.pName || '-'} · ${serviceData.pPhone || '-'}` });

    return (
      <View>
        <SummaryCard title={`${icon} Inquiry Summary`} rows={rows} />
        {/* A name, a phone number and an email are about to be written to
            Firestore. The rule refuses the inquiry without this. */}
        <ConsentCheckbox purpose="travel" value={!!serviceData.consentAccepted}
          onChange={(v) => updateServiceData({ consentAccepted: v })} />
        <Text style={styles.footNote}>
          Tap Submit to send this inquiry to our admin team. They will call or message you to confirm price and availability.
        </Text>
      </View>
    );
  }

  return null;
}

// Required-field checks the wizard calls before advancing to the next step.
// Shared by FlightSteps / BusSteps / TrainSteps.
export function validateStep(step, serviceData) {
  if (step === 0) {
    if (!serviceData.from) return 'Please select where you are traveling from.';
    if (!serviceData.to) return 'Please select your destination.';
    if (!serviceData.date) return 'Please select a travel date.';
  }
  if (step === 1) {
    if (!(serviceData.pName || '').trim()) return 'Please enter your full name.';
    if (!(serviceData.pPhone || '').trim()) return 'Please enter your mobile number.';
    if (serviceData.consentAccepted !== true) return 'Please tick the box to continue.';
  }
  return null;
}

const styles = StyleSheet.create({
  noticeBox: { backgroundColor: '#E3F2FD', padding: 12, borderRadius: radius.md, marginBottom: 14 },
  noticeText: { fontSize: 12, color: '#1565C0' },
  footNote: { fontSize: 12, color: '#999', marginTop: 4 },
});
