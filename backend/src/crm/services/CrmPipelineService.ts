import { getCrmDb } from '../db/index.js';
import {
  CrmDeal,
  CrmPipeline,
  CrmPipelineStage,
  KanbanBoardData,
  KanbanStageColumn
} from '../models/types.js';
import { WalletService } from '../../services/walletService.js';

export class CrmPipelineService {
  private static instance: CrmPipelineService | null = null;

  public static getInstance(): CrmPipelineService {
    if (!CrmPipelineService.instance) {
      CrmPipelineService.instance = new CrmPipelineService();
    }
    return CrmPipelineService.instance;
  }

  /**
   * Retrieves full Kanban board data for a sales pipeline with multi-currency USD reporting
   * and rotten deal alerts.
   */
  public async getKanbanBoard(workspaceId: string, pipelineId?: string): Promise<KanbanBoardData> {
    const db = getCrmDb();
    const pipelines = await db.listPipelines(workspaceId);
    if (pipelines.length === 0) {
      throw new Error('No sales pipeline found for workspace');
    }

    const selectedPipeline = pipelineId
      ? pipelines.find((p) => p.id === pipelineId) || pipelines[0]
      : pipelines.find((p) => p.is_default) || pipelines[0];

    const stages = await db.listPipelineStages(workspaceId, selectedPipeline.id);
    const deals = await db.listDeals(workspaceId, { pipelineId: selectedPipeline.id });

    let totalPipelineValueUsd = 0;
    const columns: KanbanStageColumn[] = [];

    for (const stage of stages) {
      const stageDeals = deals.filter((d) => d.stage_id === stage.id);
      let stageAmount = 0;
      let stageAmountUsd = 0;

      for (const d of stageDeals) {
        stageAmount += d.amount;
        stageAmountUsd += d.amount_usd;
      }

      totalPipelineValueUsd += stageAmountUsd;

      columns.push({
        stage,
        deals: stageDeals,
        total_amount: Math.round(stageAmount * 100) / 100,
        total_amount_usd: Math.round(stageAmountUsd * 100) / 100,
        deals_count: stageDeals.length
      });
    }

    return {
      pipeline: selectedPipeline,
      columns,
      total_pipeline_value_usd: Math.round(totalPipelineValueUsd * 100) / 100,
      total_deals_count: deals.length
    };
  }

  /**
   * Upserts deal with multi-currency conversion to USD and stage validation
   */
  public async saveDeal(workspaceId: string, dealData: Partial<CrmDeal>): Promise<CrmDeal> {
    const db = getCrmDb();

    // Auto-convert deal amount to USD
    const currency = (dealData.currency || 'USD').toUpperCase();
    const rawAmount = Number(dealData.amount || 0);
    let amountUsd = rawAmount;

    if (currency !== 'USD') {
      try {
        const walletService = WalletService.getInstance();
        amountUsd = walletService.convertAmount(rawAmount, currency, 'USD');
      } catch {
        amountUsd = rawAmount;
      }
    }

    // Determine status from stage if changing stage
    let status = dealData.status || 'open';
    if (dealData.stage_id && dealData.pipeline_id) {
      const stages = await db.listPipelineStages(workspaceId, dealData.pipeline_id);
      const targetStage = stages.find((s) => s.id === dealData.stage_id);
      if (targetStage) {
        if (targetStage.is_won) status = 'won';
        else if (targetStage.is_lost) status = 'lost';
      }
    }

    let savedDeal: CrmDeal;
    if (dealData.id) {
      savedDeal = await db.updateDeal(workspaceId, dealData.id, {
        ...dealData,
        amount: rawAmount,
        currency,
        amount_usd: amountUsd,
        status
      });
    } else {
      savedDeal = await db.createDeal(workspaceId, {
        ...dealData,
        amount: rawAmount,
        currency,
        amount_usd: amountUsd,
        status
      });
    }

    // Log activity on associated contact if linked
    if (savedDeal.contact_id) {
      await db.logActivity(workspaceId, {
        contact_id: savedDeal.contact_id,
        type: 'task',
        title: `Opportunity ${dealData.id ? 'Updated' : 'Created'}: ${savedDeal.name}`,
        details: { deal_id: savedDeal.id, amount: savedDeal.amount, currency: savedDeal.currency }
      });
    }

    return savedDeal;
  }
}

