
import React from 'react';

interface RenewalDisplayDemoProps {
  daysUntilExpiry?: number;
  gracePeriodActive?: boolean;
  gracePeriodDaysRemaining?: number;
  isActive?: boolean;
}

export function RenewalDisplayDemo({
  daysUntilExpiry,
  gracePeriodActive = false,
  gracePeriodDaysRemaining,
  isActive = true
}: RenewalDisplayDemoProps) {
  const getRenewalDisplayInfo = () => {
    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return {
        text: `Grace period: ${gracePeriodDaysRemaining} ${gracePeriodDaysRemaining === 1 ? 'day' : 'days'}`,
        color: 'text-amber-400',
        icon: 'ri-time-line'
      };
    }

    if (!isActive) {
      return {
        text: 'Subscription expired',
        color: 'text-red-400',
        icon: 'ri-alert-line'
      };
    }

    if (daysUntilExpiry !== undefined) {
      if (daysUntilExpiry <= 7) {
        return {
          text: `Expires in: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (daysUntilExpiry <= 30) {
        return {
          text: `Expires in: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `Renews in: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    return null;
  };

  const renewalInfo = getRenewalDisplayInfo();

  return (
    <div className="p-4 bg-muted rounded-lg">
      <h3 className="font-medium mb-2">Renewal Display Demo</h3>
      <div className="text-sm text-gray-600 mb-2">
        <div>Days until expiry: {daysUntilExpiry ?? 'N/A'}</div>
        <div>Grace period active: {gracePeriodActive ? 'Yes' : 'No'}</div>
        <div>Grace period days: {gracePeriodDaysRemaining ?? 'N/A'}</div>
        <div>Is active: {isActive ? 'Yes' : 'No'}</div>
      </div>
      {renewalInfo ? (
        <div className={`flex items-center gap-1 ${renewalInfo.color} text-sm`}>
          <i className={`${renewalInfo.icon} text-xs`}></i>
          <span>{renewalInfo.text}</span>
        </div>
      ) : (
        <div className="text-gray-500 text-sm">No renewal info to display</div>
      )}
    </div>
  );
}


export function RenewalDisplayExamples() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Renewal Display Examples</h2>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Normal renewal (45 days)</h3>
        <RenewalDisplayDemo 
          daysUntilExpiry={45} 
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Warning state (15 days)</h3>
        <RenewalDisplayDemo 
          daysUntilExpiry={15} 
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Critical state (3 days)</h3>
        <RenewalDisplayDemo 
          daysUntilExpiry={3} 
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Critical state (1 day)</h3>
        <RenewalDisplayDemo 
          daysUntilExpiry={1} 
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Grace period (5 days)</h3>
        <RenewalDisplayDemo 
          gracePeriodActive={true}
          gracePeriodDaysRemaining={5}
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Grace period (1 day)</h3>
        <RenewalDisplayDemo 
          gracePeriodActive={true}
          gracePeriodDaysRemaining={1}
          isActive={true}
        />
      </div>
      
      <div>
        <h3 className="font-medium text-sm mb-1">Expired subscription</h3>
        <RenewalDisplayDemo 
          isActive={false}
        />
      </div>
    </div>
  );
}
