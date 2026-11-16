import React, { useState, useEffect } from 'react';
import {
  Kanban,
  Plus,
  Flame,
  Clock,
  DollarSign,
  User,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search
} from 'lucide-react';
import { crmApi } from './crmApi';

interface PipelineKanbanViewProps {
  onSelectContact?: (contactId: string) => void;
  onLaunchWhatsApp?: (phone: string) => void;
}

export const PipelineKanbanView: React.FC<PipelineKanbanViewProps> = ({
  onSelectContact
}) => {
  const [kanbanData, setKanbanData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewDealOpen, setIsNewDealOpen] = useState(false);
  const [newDealForm, setNewDealForm] = useState({
    name: '',
    amount: '',
    stage_id: '',
    contact_id: '',
    currency: 'USD'
  });

  useEffect(() => {
    loadBoard();
  }, []);

  const loadBoard = async () => {
    setIsLoading(true);
    try {
      const res = await crmApi.getKanbanBoard();
      if (res.success && res.kanban) {
        setKanbanData(res.kanban);
        if (res.kanban.stages.length > 0 && !newDealForm.stage_id) {
          setNewDealForm(prev => ({ ...prev, stage_id: res.kanban.stages[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to load kanban board:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveDeal = async (dealId: string, targetStageId: string) => {
    // Optimistic UI update
    if (!kanbanData) return;
    const oldStages = [...kanbanData.stages];
    let movedDeal: any = null;

    const newStages = oldStages.map(stage => {
      const remainingDeals = stage.deals.filter((d: any) => {
        if (d.id === dealId) {
          movedDeal = { ...d, stage_id: targetStageId };
          return false;
        }
        return true;
      });
      return {
        ...stage,
        deals: remainingDeals,
        deals_count: remainingDeals.length
      };
    });

    if (movedDeal) {
      const targetStage = newStages.find(s => s.id === targetStageId);
      if (targetStage) {
        targetStage.deals.push(movedDeal);
        targetStage.deals_count = targetStage.deals.length;
      }
      setKanbanData({ ...kanbanData, stages: newStages });
    }

    try {
      await crmApi.updateDeal(dealId, { stage_id: targetStageId });
    } catch (err) {
      console.error('Failed to move deal:', err);
      // Rollback
      setKanbanData({ ...kanbanData, stages: oldStages });
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDealForm.name || !newDealForm.stage_id) return;

    try {
      await crmApi.createDeal({
        name: newDealForm.name,
        amount: parseFloat(newDealForm.amount) || 0,
        amount_usd: parseFloat(newDealForm.amount) || 0,
        stage_id: newDealForm.stage_id,
        currency: newDealForm.currency
      });
      setIsNewDealOpen(false);
      setNewDealForm({ name: '', amount: '', stage_id: '', contact_id: '', currency: 'USD' });
      loadBoard();
    } catch (err) {
      console.error('Failed to create deal:', err);
    }
  };

  if (isLoading && !kanbanData) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200/80 text-center">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading Pipeline Kanban Board...</p>
      </div>
    );
  }

  const stages = kanbanData?.stages || [];

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{kanbanData?.pipeline_name || 'B2B Sales Pipeline'}</h2>
            <p className="text-xs text-slate-500 font-medium">
              {kanbanData?.total_deals || 0} active deals • ${(kanbanData?.total_value_usd || 0).toLocaleString()} USD total pipeline value
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search deals..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>

          <button
            type="button"
            onClick={loadBoard}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
            title="Refresh Board"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsNewDealOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Deal
          </button>
        </div>
      </div>

      {/* Kanban Board Horizontal Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-[550px]">
        {stages.map((stage: any, idx: number) => {
          const filteredDeals = stage.deals.filter((d: any) =>
            d.name.toLowerCase().includes(searchTerm.toLowerCase())
          );

          return (
            <div
              key={stage.id}
              className="w-80 shrink-0 bg-slate-50/80 rounded-3xl p-4 border border-slate-200/80 flex flex-col max-h-[750px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <h3 className="text-xs font-bold text-slate-900 truncate max-w-[150px]">{stage.name}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {stage.deals_count}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-700">
                  ${(stage.stage_value_usd || 0).toLocaleString()}
                </span>
              </div>

              {/* Deal Cards Container */}
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {filteredDeals.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    No deals in this stage
                  </div>
                ) : (
                  filteredDeals.map((deal: any) => (
                    <div
                      key={deal.id}
                      className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition space-y-2.5 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-2">{deal.name}</h4>
                        {deal.is_rotten && (
                          <span
                            title="Rotten Deal: Inactive beyond stage threshold"
                            className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 shrink-0"
                          >
                            <Flame className="w-3 h-3 text-amber-600 animate-pulse" />
                            Rotten
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-emerald-600 flex items-center">
                          <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                          {(deal.amount_usd || deal.amount || 0).toLocaleString()} USD
                        </span>
                        {deal.contact_id && (
                          <button
                            type="button"
                            onClick={() => onSelectContact && onSelectContact(deal.contact_id)}
                            className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <User className="w-3 h-3" /> View Contact
                          </button>
                        )}
                      </div>

                      {/* Quick stage transition buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                        {idx > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleMoveDeal(deal.id, stages[idx - 1].id)}
                            className="flex items-center gap-1 hover:text-indigo-600 font-semibold"
                            title={`Move to ${stages[idx - 1].name}`}
                          >
                            <ArrowLeft className="w-3 h-3" /> Prev
                          </button>
                        ) : <span />}

                        {idx < stages.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveDeal(deal.id, stages[idx + 1].id)}
                            className="flex items-center gap-1 hover:text-indigo-600 font-semibold ml-auto"
                            title={`Move to ${stages[idx + 1].name}`}
                          >
                            Next <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Deal Modal */}
      {isNewDealOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Create New Deal</h3>
            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deal Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TechMatrix Annual License"
                  value={newDealForm.name}
                  onChange={e => setNewDealForm({ ...newDealForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="5000"
                    value={newDealForm.amount}
                    onChange={e => setNewDealForm({ ...newDealForm, amount: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
                  <select
                    value={newDealForm.currency}
                    onChange={e => setNewDealForm({ ...newDealForm, currency: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pipeline Stage</label>
                <select
                  value={newDealForm.stage_id}
                  onChange={e => setNewDealForm({ ...newDealForm, stage_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {stages.map((st: any) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewDealOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition"
                >
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

