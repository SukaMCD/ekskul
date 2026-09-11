/**
 * Xendit Payment Gateway Integration Helper
 * Provides functions to create invoices, verify webhooks, and query invoice status
 */

export interface XenditInvoiceItem {
  name: string;
  quantity: number;
  price: number;
  category?: string;
  url?: string;
}

export interface CreateInvoiceParams {
  externalId: string;
  amount: number;
  description: string;
  payerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  items?: XenditInvoiceItem[];
  invoiceDuration?: number; // duration in seconds, default 86400 (24h) or e.g. 3600 (1h)
  secretKey: string;
}

export interface XenditInvoiceResponse {
  id: string;
  external_id: string;
  user_id?: string;
  status: string; // PENDING, PAID, SETTLED, EXPIRED
  merchant_name?: string;
  merchant_profile_picture_url?: string;
  amount: number;
  payer_email?: string;
  description?: string;
  invoice_url: string;
  expiry_date: string;
  payment_method?: string;
  payment_channel?: string;
  payment_destination?: string;
  success_redirect_url?: string;
  failure_redirect_url?: string;
  created?: string;
  updated?: string;
}

/**
 * Creates an invoice with Xendit v2 API
 */
export async function createXenditInvoice(
  params: CreateInvoiceParams
): Promise<{ success: boolean; data?: XenditInvoiceResponse; error?: string }> {
  try {
    const {
      externalId,
      amount,
      description,
      payerEmail,
      customerName,
      customerPhone,
      items,
      invoiceDuration = 7200, // 2 jam batas pembayaran
      secretKey,
    } = params;

    if (!secretKey) {
      return { success: false, error: 'Xendit Secret Key is not configured' };
    }

    const authHeader = 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');

    const bodyPayload: Record<string, any> = {
      external_id: externalId,
      amount: Math.round(amount),
      description: description || `Pesanan ${externalId}`,
      invoice_duration: invoiceDuration,
      currency: 'IDR',
      reminder_time: 1,
    };

    if (payerEmail) {
      bodyPayload.payer_email = payerEmail;
    }

    if (customerName || customerPhone) {
      bodyPayload.customer = {
        given_names: customerName || 'Pelanggan',
        ...(customerPhone ? { mobile_number: customerPhone.startsWith('+') ? customerPhone : `+${customerPhone}` } : {}),
      };
    }

    if (items && items.length > 0) {
      bodyPayload.items = items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price: Math.round(it.price),
        ...(it.category ? { category: it.category } : {}),
      }));
    }

    const response = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const resJson = await response.json();

    if (!response.ok) {
      console.error('[XENDIT] Create invoice failed:', resJson);
      return {
        success: false,
        error: resJson.message || resJson.error_code || 'Gagal membuat invoice Xendit',
      };
    }

    return {
      success: true,
      data: resJson as XenditInvoiceResponse,
    };
  } catch (error: any) {
    console.error('[XENDIT] Unexpected error creating invoice:', error);
    return {
      success: false,
      error: error.message || 'Terjadi kesalahan sistem saat menghubungi Xendit',
    };
  }
}

/**
 * Validates the callback token from Xendit webhook request header `x-callback-token`
 */
export function verifyXenditWebhookToken(
  incomingToken: string | null | undefined,
  expectedToken: string | null | undefined
): boolean {
  if (!expectedToken) {
    // If no webhook token is configured, allow in development/testing or check warning
    console.warn('[XENDIT] Webhook token not configured in system settings');
    return true;
  }
  if (!incomingToken) {
    return false;
  }
  return incomingToken.trim() === expectedToken.trim();
}

/**
 * Retrieves invoice details by ID
 */
export async function getXenditInvoice(
  invoiceId: string,
  secretKey: string
): Promise<{ success: boolean; data?: XenditInvoiceResponse; error?: string }> {
  try {
    if (!secretKey) {
      return { success: false, error: 'Xendit Secret Key is not configured' };
    }

    const authHeader = 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch(`https://api.xendit.co/v2/invoices/${encodeURIComponent(invoiceId)}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    const resJson = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: resJson.message || 'Gagal mengambil data invoice',
      };
    }

    return {
      success: true,
      data: resJson as XenditInvoiceResponse,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
    };
  }
}
