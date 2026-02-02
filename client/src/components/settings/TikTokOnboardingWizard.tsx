import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export type TikTokOnboardingStep = 'requirements' | 'verify_account' | 'authorize' | 'complete';

const STEPS: { id: TikTokOnboardingStep; label: string }[] = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'verify_account', label: 'Verify Account' },
  { id: 'authorize', label: 'Authorize' },
  { id: 'complete', label: 'Done' }
];

interface TikTokOnboardingWizardProps {
  currentStep: TikTokOnboardingStep;
  children: React.ReactNode;
  className?: string;
}

export default function TikTokOnboardingWizard({ currentStep, children, className }: TikTokOnboardingWizardProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  const stepIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className={className}>
      <div className="mb-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Connect TikTok Business Account</h3>
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const isActive = index === stepIndex;
            const isComplete = index < stepIndex;
            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-1.5">
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className={`h-5 w-5 ${isActive ? 'text-primary fill-primary/20' : 'text-muted-foreground'}`} />
                  )}
                  <span className={`text-xs font-medium ${isActive ? 'text-foreground' : isComplete ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-px min-w-[16px] max-w-[24px] ${isComplete ? 'bg-green-500' : 'bg-border'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}

export const SCOPE_EXPLANATIONS: { scope: string; label: string; description: string }[] = [
  { scope: 'user.info.basic', label: 'Basic profile', description: 'Required to identify your account' },
  { scope: 'im.chat', label: 'Messaging', description: 'Required to send and receive messages' },
  { scope: 'business.management', label: 'Business management', description: 'Required to link messages with ad campaigns' }
];

export const PREREQUISITES_CHECKLIST = [
  'TikTok Business Account created',
  'Business verification completed',
  'Account not in restricted region (EEA/UK)'
];
