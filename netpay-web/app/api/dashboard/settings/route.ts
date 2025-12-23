import { NextRequest } from 'next/server';
import { getSettings, updateSettings } from '@/lib/api';
import { withAuth, validateOrigin, errorResponse, sanitizeString } from '@/lib/security';

export async function GET(request: NextRequest) {
  return withAuth(request, async (merchant) => {
    const result = await getSettings(merchant.id);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch settings');
    }

    return result.data;
  });
}

export async function PUT(request: NextRequest) {
  // Validate origin for state-changing operations
  if (!validateOrigin(request)) {
    return errorResponse('Invalid origin', 403);
  }

  return withAuth(request, async (merchant) => {
    let data;
    try {
      data = await request.json();
    } catch {
      throw new Error('Invalid JSON body');
    }

    // Sanitize settings data
    const sanitizedData: Record<string, unknown> = {};
    
    if (typeof data.businessName === 'string') {
      sanitizedData.businessName = sanitizeString(data.businessName, 200);
    }
    if (typeof data.webhookUrl === 'string') {
      // Validate webhook URL format
      const url = sanitizeString(data.webhookUrl, 500);
      if (url && !url.match(/^https:\/\/.+/)) {
        throw new Error('Webhook URL must use HTTPS');
      }
      sanitizedData.webhookUrl = url;
    }
    if (typeof data.notificationEmail === 'string') {
      const email = sanitizeString(data.notificationEmail, 254);
      if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Invalid email format');
      }
      sanitizedData.notificationEmail = email;
    }
    if (typeof data.enabledNetworks === 'object' && data.enabledNetworks !== null) {
      // Validate network settings
      const validNetworks = ['base', 'baseSepolia', 'arbitrum', 'optimism'];
      sanitizedData.enabledNetworks = {};
      for (const [network, enabled] of Object.entries(data.enabledNetworks)) {
        if (validNetworks.includes(network) && typeof enabled === 'boolean') {
          (sanitizedData.enabledNetworks as Record<string, boolean>)[network] = enabled;
        }
      }
    }

    const result = await updateSettings(merchant.id, sanitizedData);

    if (!result.success) {
      throw new Error(result.error || 'Failed to update settings');
    }

    return { success: true };
  });
}
