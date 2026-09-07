import React from 'react';
import TravelInquirySteps from './TravelInquirySteps';

export default function BusStep({ step }) {
  return <TravelInquirySteps step={step} hasTime icon="🚌" routeLabel="Bus" />;
}
