import { defineStepper } from '@stepperize/react';
import type { FC, ReactNode } from 'react';

const raw = defineStepper(
  { id: 'dev', title: 'Dev' },
  { id: 'review', title: 'Review' },
  { id: 'pr', title: 'PR' },
  { id: 'merged', title: 'Merged' },
);

export const useStepperCtx = raw.useStepper;
export const stepDefs = raw.steps;

// React 18 compat: stepperize primitives return bigint which React 18 doesn't accept as ReactNode
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fix = <P,>(C: any): FC<P> => C;

interface BaseProps { className?: string; children?: ReactNode }

export const Stepper = {
  Root: fix<BaseProps & { orientation?: 'horizontal' | 'vertical'; initialStep?: string }>(raw.Stepper.Root),
  List: fix<BaseProps>(raw.Stepper.List),
  Item: fix<BaseProps & { step: string }>(raw.Stepper.Item),
  Trigger: fix<BaseProps & { onClick?: () => void }>(raw.Stepper.Trigger),
  Indicator: fix<BaseProps>(raw.Stepper.Indicator),
  Title: fix<BaseProps>(raw.Stepper.Title),
  Separator: fix<BaseProps>(raw.Stepper.Separator),
  Content: fix<BaseProps & { step: string }>(raw.Stepper.Content),
};
