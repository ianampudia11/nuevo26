import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { PaymentMethod } from "@/hooks/use-payment-methods";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/contexts/currency-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PaymentMethodSelectorProps {
  paymentMethods: PaymentMethod[];
  selectedMethod: string | null;
  onSelectMethod: (methodId: string) => void;
}

export function PaymentMethodSelector({
  paymentMethods,
  selectedMethod,
  onSelectMethod
}: PaymentMethodSelectorProps) {
  const { currency } = useCurrency();

  const isMethodAvailable = (methodId: string): boolean => {
    if (methodId === 'mpesa') {
      return currency === 'KES';
    }
    if (methodId === 'moyasar') {
      return currency === 'SAR';
    }
    if (methodId === 'paystack') {
      const supported = ['NGN', 'GHS', 'ZAR', 'USD'];
      return supported.includes(currency.toUpperCase());
    }
    if (methodId === 'stripe') {
      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
      return supportedCurrencies.includes(currency.toUpperCase());
    }
    if (methodId === 'paypal') {
      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
      return supportedCurrencies.includes(currency.toUpperCase());
    }
    if (methodId === 'mercadopago') {
      const supportedCurrencies = ['USD', 'ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN', 'UYU', 'VEF'];
      return supportedCurrencies.includes(currency.toUpperCase());
    }
    return true; // bank-transfer and others are always available
  };

  const getUnavailableReason = (methodId: string): string | null => {
    if (methodId === 'mpesa' && currency !== 'KES') {
      return `MPESA only supports KES. Current currency: ${currency}`;
    }
    if (methodId === 'moyasar' && currency !== 'SAR') {
      return `Moyasar only supports SAR. Current currency: ${currency}`;
    }
    if (methodId === 'paystack' && !isMethodAvailable('paystack')) {
      return `Paystack supports NGN, GHS, ZAR, USD. Current currency: ${currency}`;
    }
    if (methodId === 'stripe' && !isMethodAvailable('stripe')) {
      return `Currency ${currency} is not supported by Stripe`;
    }
    if (methodId === 'paypal' && !isMethodAvailable('paypal')) {
      return `Currency ${currency} may not be supported by PayPal`;
    }
    if (methodId === 'mercadopago' && !isMethodAvailable('mercadopago')) {
      return `Currency ${currency} may not be supported by Mercado Pago`;
    }
    return null;
  };
  return (
    <RadioGroup
      value={selectedMethod || undefined}
      onValueChange={onSelectMethod}
      className="space-y-3"
    >
      {paymentMethods.map((method) => {
        const isAvailable = isMethodAvailable(method.id);
        const unavailableReason = getUnavailableReason(method.id);
        
        return (
        <TooltipProvider key={method.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-2">
                <Card className={`w-full transition-colors ${
                  !isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
                } ${selectedMethod === method.id ? 'border-primary' : ''}`}>
                  <CardContent className="p-4">
                    <RadioGroupItem
                      value={method.id}
                      id={`payment-${method.id}`}
                      className="peer sr-only"
                      disabled={!isAvailable}
                    />
                    <Label
                      htmlFor={`payment-${method.id}`}
                      className={`flex items-center justify-between ${isAvailable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                <div className="flex items-center gap-4">
                  {method.id === 'stripe' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-bank-card-line text-2xl text-blue-600"></i>
                    </div>
                  )}
                  {method.id === 'mercadopago' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-bank-card-line text-2xl text-blue-500"></i>
                    </div>
                  )}
                  {method.id === 'paypal' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-paypal-line text-2xl text-blue-700"></i>
                    </div>
                  )}
                  {method.id === 'moyasar' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-bank-card-line text-2xl text-green-600"></i>
                    </div>
                  )}
                  {method.id === 'mpesa' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-smartphone-line text-2xl text-green-500"></i>
                    </div>
                  )}
                  {method.id === 'paystack' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-bank-card-line text-2xl text-emerald-600"></i>
                    </div>
                  )}
                  {method.id === 'bank-transfer' && (
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className="ri-bank-line text-2xl text-green-600"></i>
                    </div>
                  )}
                      <div>
                        <div className="font-medium">{method.name}</div>
                        <div className="text-sm text-muted-foreground">{method.description}</div>
                        {method.testMode && (
                          <div className="text-xs text-amber-600 mt-1">Test Mode Enabled</div>
                        )}
                        {!isAvailable && (
                          <div className="text-xs text-red-600 mt-1">Unavailable for {currency}</div>
                        )}
                      </div>
                    </div>
                    <div className="h-4 w-4 rounded-full border-2 border-gray-700 flex items-center justify-center">
                      {selectedMethod === method.id && (
                        <div className="h-2 w-2 rounded-full bg-gray-700"></div>
                      )}
                    </div>
                  </Label>
                </CardContent>
              </Card>
            </div>
            </TooltipTrigger>
            {unavailableReason && (
              <TooltipContent>
                <p>{unavailableReason}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
      })}
    </RadioGroup>
  );
}
