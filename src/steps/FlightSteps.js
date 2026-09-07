import React from 'react';
import TravelInquirySteps from './TravelInquirySteps';

export default function FlightStep({ step }) {
  return <TravelInquirySteps step={step} hasTime={false} icon="✈️" routeLabel="Flight" />;
}
