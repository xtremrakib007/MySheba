import React from 'react';
import TravelInquirySteps from './TravelInquirySteps';

export default function TrainStep({ step }) {
  return <TravelInquirySteps step={step} hasTime icon="🚂" routeLabel="Train" />;
}
