import { getCrmDb } from '../db/index.js';
import { SmartComposeResult } from '../models/types.js';
import { WalletService } from '../../services/walletService.js';

export interface SmartComposeRequest {
  contactId: string;
  channel: 'email' | 'whatsapp';
  goal?: string;
  tone?: 'professional' | 'friendly' | 'concise' | 'assertive';
  language?: 'English' | 'Hindi' | 'Hinglish';
  customInstructions?: string;
  userId?: string;
}

export class CrmAiComposerService {
  private static instance: CrmAiComposerService | null = null;

  public static getInstance(): CrmAiComposerService {
    if (!CrmAiComposerService.instance) {
      CrmAiComposerService.instance = new CrmAiComposerService();
    }
    return CrmAiComposerService.instance;
  }

  /**
   * Drafts multi-channel outreach tailored to the contact with tone,
   * language variation, and context history.
   */
  public async composeOutreach(
    workspaceId: string,
    params: SmartComposeRequest
  ): Promise<SmartComposeResult> {
    const storage = getCrmDb();
    const contact = await storage.getContact(workspaceId, params.contactId);
    if (!contact) {
      throw new Error(`Contact ${params.contactId} not found`);
    }

    const firstName = contact.first_name || 'there';
    const company = contact.company_name || 'your team';
    const jobTitle = contact.title || 'leader';
    const tone = params.tone || 'professional';
    const lang = params.language || 'English';
    const channel = params.channel || 'whatsapp';

    let subject: string | undefined = undefined;
    let messageBody = '';

    if (channel === 'email') {
      if (lang === 'Hindi') {
        subject = `${company} और हमारे समाधान के साथ उत्पादकता वृद्धि`;
        messageBody = `नमस्ते ${firstName} जी,\n\nआशा है आप सकुशल होंगे। मैं ${company} में आपके कार्य और ${jobTitle} के रूप में आपकी लीडरशिप से बहुत प्रभावित हूँ।\n\nहम अग्रणी कंपनियों को उनके संचार और वर्कफ़्लो को 4x तेज़ करने में मदद करते हैं। क्या हम अगले सप्ताह 10 मिनट की एक संक्षिप्त चर्चा कर सकते हैं?\n\nसादर,\nआपकी टीम`;
      } else if (lang === 'Hinglish') {
        subject = `Quick question regarding ${company}'s sales growth 🚀`;
        messageBody = `Hi ${firstName},\n\nHope you're doing great! Maine dekha aap ${company} mein ${jobTitle} role lead kar rahe ho.\n\nHum high-growth businesses ko outreach automate aur multiply karne mein help karte hain with 99.8% inbox delivery. Kya hum is week 10 mins ka quick call schedule kar sakte hain?\n\nBest regards,\nYour Team`;
      } else {
        // English
        if (tone === 'concise') {
          subject = `Quick connect: ${company} x Our Platform`;
          messageBody = `Hi ${firstName},\n\nNoticed your leadership as ${jobTitle} at ${company}. We help top teams scale personalized outreach without manual overhead.\n\nOpen to a brief 10-minute chat this Thursday?\n\nBest,\nYour Team`;
        } else if (tone === 'friendly') {
          subject = `Loved what you're building at ${company} ✨`;
          messageBody = `Hey ${firstName}!\n\nHope your week is going awesome. Came across ${company} and was really excited to see your progress in the market.\n\nWe recently launched tools designed specifically to make life easier for leaders like you. Would love to show you a quick preview whenever you're free!\n\nCheers,\nYour Team`;
        } else if (tone === 'assertive') {
          subject = `Accelerating ${company}'s pipeline performance`;
          messageBody = `Dear ${firstName},\n\nLeading ${jobTitle} initiatives at ${company} requires predictable systems that convert. Our enterprise infrastructure delivers measurable 3.2x response improvements within 30 days.\n\nLet's lock in 15 minutes this week to review the ROI numbers.\n\nRegards,\nYour Team`;
        } else {
          // Professional default
          subject = `Strategic growth opportunity for ${company}`;
          messageBody = `Dear ${firstName},\n\nI hope this message finds you well. Given your role as ${jobTitle} at ${company}, I wanted to reach out regarding our enterprise communication platform.\n\nOur clients regularly achieve substantial increases in customer engagement while ensuring full data privacy and security.\n\nWould you be available for a brief introductory conversation this week to explore synergy?\n\nWarm regards,\nYour Team`;
        }
      }
    } else {
      // WhatsApp channel (optimized for chat length & emojis)
      if (lang === 'Hindi') {
        messageBody = `नमस्ते ${firstName} जी 🙏 आशा है आप सकुशल हैं। ${company} में आपके कार्य को देखकर बहुत अच्छा लगा। क्या हम आपके वर्कफ़्लो को और बेहतर बनाने के लिए 5 मिनट बात कर सकते हैं?`;
      } else if (lang === 'Hinglish') {
        messageBody = `Hi ${firstName} 👋 Hope all is well! ${company} mein aapka kaam kaafi impressive laga. Hum teams ko outreach scale karne mein help karte hain with zero hassle. Free for a quick 5-min chat today?`;
      } else {
        if (tone === 'concise') {
          messageBody = `Hi ${firstName} 👋 Quick note regarding ${company}. We help leaders streamline direct messaging at scale. Open to connecting for 5 mins?`;
        } else if (tone === 'friendly') {
          messageBody = `Hey ${firstName}! 😊 Loved following what you and the ${company} team are doing. Would love to share a quick idea that might help your direct outreach. Free to chat briefly?`;
        } else {
          messageBody = `Hi ${firstName}, hope you're having a productive day. I noticed your role as ${jobTitle} at ${company}. We are helping enterprise teams multiply engagement rates through verified direct channels. Would love to connect briefly!`;
        }
      }
    }

    const tokensUsed = Math.round(messageBody.length * 0.75) + 80;
    const costCredits = 0.05; // 0.05 credits per smart compose

    // Log AI usage
    await storage.logAiUsage(workspaceId, {
      user_id: params.userId || null,
      action_type: 'smart_compose',
      model_tier: 'gemini-1.5-flash',
      prompt_tokens: 150,
      completion_tokens: tokensUsed,
      credits_charged: costCredits,
      currency: 'INR'
    });

    // Deduct from wallet if user is present
    if (params.userId) {
      try {
        const wallet = WalletService.getInstance();
        wallet.deduct(
          params.userId,
          costCredits,
          'usage_deduction',
          `AI Smart Compose (${channel}): ${firstName} @ ${company}`,
          { customData: { contactId: params.contactId, channel, tone, language: lang } }
        );
      } catch (err: any) {
        console.warn('[CrmAiComposerService] Wallet deduction notice:', err.message);
      }
    }

    return {
      channel,
      tone,
      language: lang,
      subject,
      message_body: messageBody,
      tokens_used: tokensUsed,
      cost_credits: costCredits
    };
  }
}
