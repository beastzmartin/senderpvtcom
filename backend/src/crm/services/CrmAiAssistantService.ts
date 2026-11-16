import { getCrmDb } from '../db/index.js';
import { ContactAiSummary } from '../models/types.js';
import { WalletService } from '../../services/walletService.js';

export interface GenerateBriefOptions {
  userId?: string;
  forceRefresh?: boolean;
}

export class CrmAiAssistantService {
  private static instance: CrmAiAssistantService | null = null;

  public static getInstance(): CrmAiAssistantService {
    if (!CrmAiAssistantService.instance) {
      CrmAiAssistantService.instance = new CrmAiAssistantService();
    }
    return CrmAiAssistantService.instance;
  }

  /**
   * Generates a 1-paragraph executive brief, interest signals, objection notes,
   * sentiment score, and recommended next best action for a contact.
   */
  public async generateContactBrief(
    workspaceId: string,
    contactId: string,
    options: GenerateBriefOptions = {}
  ): Promise<ContactAiSummary> {
    const storage = getCrmDb();
    const contact = await storage.getContact(workspaceId, contactId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    const [activities, company] = await Promise.all([
      storage.listActivities(workspaceId, contactId, 10),
      contact.company_id ? storage.getCompany(workspaceId, contact.company_id) : Promise.resolve(null)
    ]);

    // Synthesize context
    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Prospect';
    const title = contact.title || 'Professional';
    const compName = company?.name || contact.company_name || 'an enterprise account';
    const hasPhone = !!(contact.phone || contact.phone_e164);
    const emailValid = contact.email_status === 'valid';

    // Activity review
    const totalActivities = activities.length;
    const latestActivity = activities[0] || null;
    const daysSinceLastContact = latestActivity
      ? Math.round((Date.now() - new Date(latestActivity.created_at).getTime()) / (1000 * 3600 * 24))
      : 30;

    // AI Heuristic Generation Engine
    const interestSignals: string[] = [];
    const objectionsNoted: string[] = [];
    let sentiment: 'positive' | 'neutral' | 'skeptical' | 'ready_to_buy' = 'neutral';
    let recommendedAction = 'Email follow-up with executive value proposition';

    if (contact.lead_score >= 80) {
      sentiment = 'ready_to_buy';
      interestSignals.push('High intent lead score indicating strong ICP alignment');
      recommendedAction = hasPhone
        ? 'Direct WhatsApp outreach or phone call regarding pilot deployment'
        : 'High-priority email with demo calendar link';
    } else if (contact.lead_score >= 50) {
      sentiment = 'positive';
      interestSignals.push('Moderate engagement and target buyer profile');
      recommendedAction = 'Send personalized case study and request discovery call';
    } else {
      sentiment = 'neutral';
      objectionsNoted.push('Early stage or limited recorded interactions');
      recommendedAction = 'Add to educational nurture workflow and wait 7 days';
    }

    if (totalActivities > 3) {
      interestSignals.push(`Multiple touchpoints recorded (${totalActivities} touchpoints in timeline)`);
    }

    if (daysSinceLastContact > 21) {
      objectionsNoted.push(`Cooling lead: ${daysSinceLastContact} days since last engagement`);
    }

    const executiveBrief = `${contactName} is a ${title} at ${compName}. With an evaluated lead score of ${contact.lead_score}/100 and ${emailValid ? 'verified' : 'unverified'} communication channels, ${
      sentiment === 'ready_to_buy'
        ? 'this prospect is a prime conversion candidate for high-touch sales outreach.'
        : sentiment === 'positive'
        ? 'they have shown steady momentum and should be engaged with product-fit positioning.'
        : 'they remain in early evaluation and require automated value nurturing.'
    } Primary recommendation is to execute: ${recommendedAction}.`;

    const summary: ContactAiSummary = {
      contact_id: contactId,
      executive_brief: executiveBrief,
      interest_signals: interestSignals,
      objections_noted: objectionsNoted,
      recommended_next_action: recommendedAction,
      sentiment,
      generated_at: new Date().toISOString()
    };

    // Calculate simulated token usage & credit deduction
    const promptTokens = Math.round(executiveBrief.length * 0.7) + 120;
    const completionTokens = Math.round(executiveBrief.length * 0.4) + 60;
    const costCredits = 0.05; // 0.05 INR per brief

    // Log AI Usage
    await storage.logAiUsage(workspaceId, {
      user_id: options.userId || null,
      action_type: 'contact_brief',
      model_tier: 'gemini-1.5-flash',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      credits_charged: costCredits,
      currency: 'INR'
    });

    // Deduct from wallet if user is present
    if (options.userId) {
      try {
        const wallet = WalletService.getInstance();
        wallet.deduct(
          options.userId,
          costCredits,
          'usage_deduction',
          `AI Contact Executive Brief: ${contactName}`,
          { customData: { contactId, action: 'contact_brief' } }
        );
      } catch (err: any) {
        console.warn('[CrmAiAssistantService] Wallet deduction notice:', err.message);
      }
    }

    return summary;
  }
}
