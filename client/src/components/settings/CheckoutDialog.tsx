import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, CheckCircle } from "lucide-react";
import { Plan } from "@/hooks/use-available-plans";
import { PaymentMethod } from "@/hooks/use-payment-methods";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getPlanBillingPeriod } from "@/utils/plan-duration";
import { useCurrency } from "@/contexts/currency-context";


declare global {
  interface Window {
    Moyasar?: {
      init: (config: {
        element: string;
        amount: number;
        currency: string;
        description: string;
        publishable_api_key: string;
        callback_url: string;
        methods: string[];
        on_completed?: (payment: {
          id: string;
          status: string;
          amount: number;
          currency: string;
          description: string;
          [key: string]: any;
        }) => Promise<void> | void;
      }) => void;
    };
  }
}

interface CheckoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
  paymentMethods: PaymentMethod[];
  onSuccess: () => void;
}

export function CheckoutDialog({
  isOpen,
  onClose,
  plan,
  paymentMethods,
  onSuccess
}: CheckoutDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [bankTransferDetails, setBankTransferDetails] = useState<any>(null);
  const [showBankTransferInstructions, setShowBankTransferInstructions] = useState(false);
  const [showMoyasarForm, setShowMoyasarForm] = useState(false);
  const [moyasarConfig, setMoyasarConfig] = useState<any>(null);
  const [showMpesaForm, setShowMpesaForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mpesaResponse, setMpesaResponse] = useState<any>(null);
  const { toast } = useToast();
  const { formatCurrency, currency } = useCurrency();

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!plan || !selectedMethod) {
        throw new Error("Please select a plan and payment method");
      }


      const payload: any = {
        planId: plan.id,
        originUrl: window.location.origin
      };


      if (selectedMethod === 'moyasar') {
        payload.callbackUrl = `${window.location.origin}/payment/success?source=moyasar&transaction_id=`;
      }


      if (selectedMethod === 'mpesa') {
        if (!phoneNumber) {
          throw new Error("Phone number is required for MPESA payment");
        }
        payload.phoneNumber = phoneNumber;
      }

      const res = await apiRequest("POST", `/api/payment/checkout/${selectedMethod}`, payload);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to create checkout session");
      }

      return res.json();
    },
    onSuccess: (data) => {
      if (selectedMethod === 'bank-transfer') {

        setBankTransferDetails(data);
        setShowBankTransferInstructions(true);
      } else if (selectedMethod === 'moyasar') {

        setMoyasarConfig(data);
        setShowMoyasarForm(true);
      } else if (selectedMethod === 'mpesa') {

        setMpesaResponse(data);
        setShowMpesaForm(true);
      } else {

        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          toast({
            title: "Checkout Error",
            description: "No checkout URL received from server",
            variant: "destructive"
          });
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleCheckout = () => {
    if (!selectedMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please select a payment method to continue",
        variant: "destructive"
      });
      return;
    }


    if (selectedMethod === 'mpesa') {
      if (currency !== 'KES') {
        toast({
          title: "Currency Mismatch",
          description: `MPESA only supports KES (Kenyan Shillings). Current configured currency is ${currency}. Please change the default currency to KES in General Settings.`,
          variant: "destructive"
        });
        return;
      }
      if (!phoneNumber) {
        toast({
          title: "Phone Number Required",
          description: "Please enter your phone number for MPESA payment",
          variant: "destructive"
        });
        return;
      }

      const phoneRegex = /^254[0-9]{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid Kenyan phone number (format: 254XXXXXXXXX)",
          variant: "destructive"
        });
        return;
      }
    }

    if (selectedMethod === 'moyasar') {
      if (currency !== 'SAR') {
        toast({
          title: "Currency Mismatch",
          description: `Moyasar only supports SAR (Saudi Riyal). Current configured currency is ${currency}. Please change the default currency to SAR in General Settings.`,
          variant: "destructive"
        });
        return;
      }
    }

    if (selectedMethod === 'paystack') {
      const supported = ['NGN', 'GHS', 'ZAR', 'USD'];
      if (!supported.includes(currency.toUpperCase())) {
        toast({
          title: "Currency Not Supported",
          description: `Paystack supports NGN, GHS, ZAR, and USD. Current currency is ${currency}.`,
          variant: "destructive"
        });
        return;
      }
    }


    if (selectedMethod === 'stripe') {
      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
      if (!supportedCurrencies.includes(currency.toUpperCase())) {
        toast({
          title: "Currency Not Supported",
          description: `Currency ${currency} is not supported by Stripe. Please configure a supported currency in General Settings.`,
          variant: "destructive"
        });
        return;
      }
    }

    if (selectedMethod === 'paypal') {
      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
      if (!supportedCurrencies.includes(currency.toUpperCase())) {
        toast({
          title: "Currency Not Supported",
          description: `Currency ${currency} may not be supported by PayPal. Please verify your PayPal account configuration supports this currency.`,
          variant: "destructive"
        });
        return;
      }
    }

    if (selectedMethod === 'mercadopago') {
      const supportedCurrencies = ['USD', 'ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN', 'UYU', 'VEF'];
      if (!supportedCurrencies.includes(currency.toUpperCase())) {
        toast({
          title: "Currency Not Supported",
          description: `Currency ${currency} may not be supported by Mercado Pago. Supported currencies: ${supportedCurrencies.join(', ')}. Please verify your Mercado Pago account configuration.`,
          variant: "destructive"
        });
        return;
      }
    }

    checkoutMutation.mutate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "The information has been copied to your clipboard.",
    });
  };

  const handleBankTransferComplete = () => {
    setShowBankTransferInstructions(false);
    setBankTransferDetails(null);
    onClose();
    onSuccess();
    toast({
      title: "Payment Instructions Received",
      description: "Please complete the bank transfer. Your subscription will be activated once payment is confirmed.",
    });
  };



  const handleMoyasarCancel = () => {
    setShowMoyasarForm(false);
    setMoyasarConfig(null);
  };

  const handleMpesaCancel = () => {
    setShowMpesaForm(false);
    setMpesaResponse(null);
  };


  useEffect(() => {
    if (showMoyasarForm && moyasarConfig) {

      const loadMoyasarScripts = async () => {

        if (!document.querySelector('link[href*="moyasar.css"]')) {
          const cssLink = document.createElement('link');
          cssLink.rel = 'stylesheet';
          cssLink.href = 'https://unpkg.com/moyasar-payment-form@2.0.14/dist/moyasar.css';
          document.head.appendChild(cssLink);
        }


        if (!window.Moyasar) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/moyasar-payment-form@2.0.14/dist/moyasar.umd.js';
          script.onload = () => {
            initializeMoyasarForm();
          };
          script.onerror = (error) => {
            console.error('Failed to load Moyasar script:', error);
            toast({
              title: "Payment System Error",
              description: "Failed to load payment system. Please try again.",
              variant: "destructive"
            });
          };
          document.head.appendChild(script);
        } else {
          initializeMoyasarForm();
        }
      };

      const initializeMoyasarForm = () => {
        const formElement = document.getElementById('moyasar-form');

        if (formElement && window.Moyasar) {

          formElement.innerHTML = '';

          try {

            window.Moyasar.init({
              element: '#moyasar-form',
              amount: moyasarConfig.amount,
              currency: moyasarConfig.currency,
              description: moyasarConfig.description,
              publishable_api_key: moyasarConfig.publishableKey,
              callback_url: moyasarConfig.callbackUrl,
              methods: ['creditcard']
            });
          } catch (error) {
            console.error('Error initializing Moyasar form:', error);
            toast({
              title: "Payment System Error",
              description: "Failed to initialize payment form. Please try again.",
              variant: "destructive"
            });
          }
        }
      };

      loadMoyasarScripts();
    }
  }, [showMoyasarForm, moyasarConfig]);

  if (!plan) return null;

  if (showBankTransferInstructions && bankTransferDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Bank Transfer Instructions
            </DialogTitle>
            <DialogDescription>
              Please transfer the exact amount to the following bank account. Your subscription will be activated once we confirm the payment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="font-semibold">Amount:</span>
                  <span className="text-lg font-bold">{formatCurrency(plan?.price || 0)}</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account Name</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm">
                      {bankTransferDetails.bankDetails?.accountName}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.accountName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account Number</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                      {bankTransferDetails.bankDetails?.accountNumber}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.accountNumber)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Bank Name</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-muted rounded text-sm">
                      {bankTransferDetails.bankDetails?.bankName}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.bankName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {bankTransferDetails.bankDetails?.routingNumber && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Routing Number</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                        {bankTransferDetails.bankDetails.routingNumber}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(bankTransferDetails.bankDetails.routingNumber)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {bankTransferDetails.bankDetails?.swiftCode && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">SWIFT Code</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                        {bankTransferDetails.bankDetails.swiftCode}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(bankTransferDetails.bankDetails.swiftCode)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Payment Reference</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm font-mono">
                      {bankTransferDetails.bankDetails?.reference}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(bankTransferDetails.bankDetails?.reference)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Please include this reference in your transfer to ensure quick processing
                  </p>
                </div>

                {bankTransferDetails.bankDetails?.instructions && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Additional Instructions</Label>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                      {bankTransferDetails.bankDetails.instructions}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-medium text-amber-800 mb-2">Important Notes:</h4>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• Please transfer the exact amount shown above</li>
                <li>• Include the payment reference in your transfer</li>
                <li>• Processing may take 1-3 business days</li>
                <li>• You'll receive an email confirmation once payment is verified</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleBankTransferComplete}>
              I've Made the Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }


  if (showMoyasarForm && moyasarConfig) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleMoyasarCancel()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Payment - {plan.name}</DialogTitle>
            <DialogDescription>
              Enter your card details to complete the payment securely with Moyasar.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Payment Summary</h3>
              <div className="bg-muted p-3 rounded-md">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">{formatCurrency(moyasarConfig.amount / 100)}</span>
                </div>
              </div>
            </div>

            {/* Moyasar payment form will be rendered here */}
            <div id="moyasar-form" className="min-h-[200px]"></div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleMoyasarCancel}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }


  if (showMpesaForm && mpesaResponse) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleMpesaCancel()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MPESA Payment - {plan.name}</DialogTitle>
            <DialogDescription>
              STK Push has been sent to your phone. Please complete the payment.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Payment Summary</h3>
              <div className="bg-muted p-3 rounded-md">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">{plan.name}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">{formatCurrency(plan.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-medium">{phoneNumber}</span>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
              <div className="flex items-center mb-2">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span className="font-medium text-green-800">STK Push Sent</span>
              </div>
              <p className="text-sm text-green-700 mb-2">
                {mpesaResponse.customerMessage || mpesaResponse.message}
              </p>
              <p className="text-xs text-green-600">
                Transaction ID: {mpesaResponse.transactionId}
              </p>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>• Check your phone for the MPESA payment prompt</p>
              <p>• Enter your MPESA PIN to complete the payment</p>
              <p>• Your subscription will be activated automatically once payment is confirmed</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleMpesaCancel}>
              Close
            </Button>
            <Button
              onClick={() => {
                handleMpesaCancel();
                onSuccess();
              }}
              className="btn-brand-primary"
            >
              I've Completed Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subscribe to {plan.name}</DialogTitle>
          <DialogDescription>
            Choose your preferred payment method to complete your subscription.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">Plan Details</h3>
            <div className="bg-muted p-3 rounded-md">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-medium">{plan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price:</span>
                <span className="font-medium">{formatCurrency(plan.price)}{getPlanBillingPeriod(plan)}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Payment Method</h3>
            <PaymentMethodSelector
              paymentMethods={paymentMethods}
              selectedMethod={selectedMethod}
              onSelectMethod={setSelectedMethod}
            />

            {/* MPESA Phone Number Input */}
            {selectedMethod === 'mpesa' && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="phone-number">Phone Number</Label>
                <Input
                  id="phone-number"
                  type="tel"
                  placeholder="254XXXXXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your Kenyan phone number in the format 254XXXXXXXXX
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={checkoutMutation.isPending}>
            Cancel
          </Button>
          <Button className="btn-brand-primary" onClick={handleCheckout} disabled={checkoutMutation.isPending}>
            {checkoutMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Proceed to Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
