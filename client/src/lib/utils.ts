import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChannelConnection, Contact } from "@shared/schema";
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone?: string): string {
  if (!phone) return "";
  
  const cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length > 10) {
    return `+${cleaned.slice(0, cleaned.length - 10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }
  
  return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3");
}

export function findChannelConnectionForContact(
  contact: Contact,
  connections: ChannelConnection[]
): ChannelConnection | undefined {
  if (!contact || !connections?.length) return undefined;
  
  if (contact.identifierType === 'whatsapp') {
    return connections.find(conn => 
      (conn.channelType === 'whatsapp' || conn.channelType === 'whatsapp_unofficial') && 
      conn.status === 'active'
    );
  }
  
  if (contact.identifierType) {
    return connections.find(conn => 
      conn.channelType === contact.identifierType && 
      conn.status === 'active'
    );
  }
  
  return undefined;
}

/**
 * Formats a number as currency using the specified currency code.
 * 
 * @param amount - The amount to format
 * @param currency - The currency code (ISO 4217), defaults to 'USD'
 * @returns Formatted currency string
 * 
 * @remarks
 * Components should prefer using the `useCurrency` hook from `@/contexts/currency-context`
 * instead of calling this function directly, as it will automatically use the configured
 * default currency from general settings.
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch (error) {

    if (error instanceof RangeError) {

      return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    throw error;
  }
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Extracts initials from a name string, handling edge cases like empty names,
 * single-character names, and names with special characters.
 * 
 * @param name - The name string to extract initials from
 * @returns A string containing up to 2 uppercase initials, or '?' for empty names
 */
export function getInitials(name: string): string {
  if (!name || !name.trim()) {
    return '?'; // Fallback for empty names
  }
  
  return name
    .trim()
    .split(/\s+/) // Split on one or more whitespace characters
    .filter(part => part.length > 0) // Remove empty parts
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}