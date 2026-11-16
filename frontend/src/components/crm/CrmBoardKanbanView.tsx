import React, { useState, useEffect } from 'react';
import {
  Kanban,
  Plus,
  Settings,
  MoreVertical,
  MoveRight,
  MessageCircle,
  Phone,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Layout,
  RefreshCw,
  Search,
  Filter,
  Check,
  ChevronDown,
  Layers,
  Sparkles,
  DollarSign,
  Undo2,
  Clock,
  Eye,
  Trash2,
  ChevronRight,
  User,
  Tag as TagIcon
} from 'lucide-react';
import { crmApi } from './crmApi';
import { CardLayoutDesignerModal } from './CardLayoutDesignerModal';
import {
  Button,
  Badge,
  Input,
  Drawer,
  Modal,
  Skeleton,
  EmptyState
} from './ui/CrmDesignSystem';

interface BoardColumn {
  id: string;
  name: string;
  color: string;
  order_index: number;
  wip_limit?: number | null;
  stage_type: 'standard' | 'won' | 'lost';
  card_count: number;
}

interface BoardCard {
  id: string;
  board_id: string;
  column_id: string;
  rank: string;
  entity_type: string;
  entity_id: string;
  entity_data?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    lead_score?: number;
    status?: string;
    company_name?: string;
    custom_fields?: Record<string, any>;
  };
}

interface Props {
  onStartWhatsAppChat?: (phone: string) => void;
  onSelectContact?: (contactId: string) => void;
}

export const CrmBoardKanbanView: React.FC<Props> = ({
  onStartWhatsAppChat,
  onSelectContact
}) => {
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [board, setBoard] = useState<any | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cardsByColumn, setCardsByColumn] = useState<Record<string, BoardCard[]>>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any | null>(null);
  const [availableSuperFields, setAvailableSuperFields] = useState<any[]>([]);

  // Search & Density
  const [cardSearch, setCardSearch] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Modals & Drawers
  const [isLayoutDesignerOpen, setIsLayoutDesignerOpen] = useState(false);
  const [isNewBoardWizardOpen, setIsNewBoardWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newBoardName, setNewBoardName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('sales_funnel');

  // Card Detail Drawer
  const [selectedCardForDrawer, setSelectedCardForDrawer] = useState<BoardCard | null>(null);
  const [cardDrawerTab, setCardDrawerTab] = useState<'details' | 'timeline' | 'notes'>('details');

  // Quick Move Modal
  const [isMoveCardModalOpen, setIsMoveCardModalOpen] = useState(false);
  const [cardToMove, setCardToMove] = useState<BoardCard | null>(null);

  // Undo Toast state
  const [lastMoveAction, setLastMoveAction] = useState<{
    cardId: string;
    sourceColumnId: string;
    targetColumnId: string;
    targetColumnName: string;
  } | null>(null);

  // Dragging state
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

  useEffect(() => {
    loadBoards();
    loadSuperFields();
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardDetails(selectedBoardId);
    }
  }, [selectedBoardId]);

  const loadBoards = async () => {
    try {
      const res = await crmApi.listBoards();
      if (res && res.success && res.boards) {
        setBoards(res.boards);
        if (res.boards.length > 0 && !selectedBoardId) {
          setSelectedBoardId(res.boards[0].id);
        } else if (res.boards.length === 0) {
          const defBoard = await crmApi.createBoardFromTemplate('sales_funnel', 'Sales Pipeline');
          if (defBoard && defBoard.board) {
            setBoards([defBoard.board]);
            setSelectedBoardId(defBoard.board.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load boards:', err);
    }
  };

  const loadSuperFields = async () => {
    try {
      const res = await crmApi.listSuperFields('contact');
      if (res && res.success && res.fields) {
        setAvailableSuperFields(res.fields);
      }
    } catch (err) {
      console.error('Failed to load super fields:', err);
    }
  };

  const loadBoardDetails = async (bId: string) => {
    setLoading(true);
    try {
      const [boardRes, statsRes] = await Promise.all([
        crmApi.getBoard(bId),
        crmApi.getBoardStats(bId).catch(() => ({ success: false, stats: null }))
      ]);

      if (boardRes && boardRes.success && boardRes.board) {
        setBoard(boardRes.board);
        const cols = boardRes.board.columns || [];
        setColumns(cols);

        const cardMap: Record<string, BoardCard[]> = {};
        for (const col of cols) {
          const cardsRes = await crmApi.listBoardCards(bId, col.id, undefined, 50);
          cardMap[col.id] = cardsRes.cards || [];
        }
        setCardsByColumn(cardMap);
      }

      if (statsRes && statsRes.success && statsRes.stats) {
        setStats(statsRes.stats);
      }
    } catch (err) {
      console.error('Failed to load board details:', err);
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, card: BoardCard) => {
    setDraggedCardId(card.id);
    e.dataTransfer.setData('text/plain', card.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnColumn = async (targetColumnId: string) => {
    if (!draggedCardId) return;

    let targetCard: BoardCard | null = null;
    let sourceColumnId = '';

    for (const [colId, cardList] of Object.entries(cardsByColumn)) {
      const found = cardList.find((c) => c.id === draggedCardId);
      if (found) {
        targetCard = found;
        sourceColumnId = colId;
        break;
      }
    }

    if (!targetCard || sourceColumnId === targetColumnId) {
      setDraggedCardId(null);
      return;
    }

    const targetCol = columns.find((c) => c.id === targetColumnId);

    // Optimistic UI update
    const sourceCards = cardsByColumn[sourceColumnId].filter((c) => c.id !== targetCard!.id);
    const targetCards = [...(cardsByColumn[targetColumnId] || []), { ...targetCard, column_id: targetColumnId }];

    setCardsByColumn((prev) => ({
      ...prev,
      [sourceColumnId]: sourceCards,
      [targetColumnId]: targetCards
    }));

    // Trigger Undo Toast
    setLastMoveAction({
      cardId: targetCard.id,
      sourceColumnId,
      targetColumnId,
      targetColumnName: targetCol?.name || 'New Stage'
    });

    try {
      const lastRank = targetCards.length > 1 ? targetCards[targetCards.length - 2].rank : null;
      await crmApi.moveBoardCard(targetCard.id, targetColumnId, lastRank, null);
    } catch (err) {
      console.error('Failed to move card:', err);
      loadBoardDetails(selectedBoardId);
    } finally {
      setDraggedCardId(null);
    }
  };

  // Undo Last Move
  const handleUndoMove = async () => {
    if (!lastMoveAction) return;
    const { cardId, sourceColumnId, targetColumnId } = lastMoveAction;

    let cardToRevert: BoardCard | null = null;
    for (const [, list] of Object.entries(cardsByColumn)) {
      const found = list.find((c) => c.id === cardId);
      if (found) {
        cardToRevert = found;
        break;
      }
    }

    if (!cardToRevert) return;

    setCardsByColumn((prev) => ({
      ...prev,
      [targetColumnId]: (prev[targetColumnId] || []).filter((c) => c.id !== cardId),
      [sourceColumnId]: [...(prev[sourceColumnId] || []), { ...cardToRevert!, column_id: sourceColumnId }]
    }));

    setLastMoveAction(null);

    try {
      await crmApi.moveBoardCard(cardId, sourceColumnId, null, null);
    } catch {
      loadBoardDetails(selectedBoardId);
    }
  };

  // Guided Wizard: Create Board
  const handleFinishWizard = async () => {
    if (!newBoardName.trim()) return;
    try {
      const res = await crmApi.createBoardFromTemplate(selectedTemplate, newBoardName.trim());
      if (res && res.success && res.board) {
        setBoards((prev) => [res.board, ...prev]);
        setSelectedBoardId(res.board.id);
        setIsNewBoardWizardOpen(false);
        setNewBoardName('');
      }
    } catch (err: any) {
      alert(`Failed to create board: ${err.message}`);
    }
  };

  // Filter cards by search
  const filterCards = (list: BoardCard[] = []) => {
    if (!cardSearch.trim()) return list;
    const q = cardSearch.toLowerCase();
    return list.filter((c) => {
      const fn = c.entity_data?.first_name?.toLowerCase() || '';
      const ln = c.entity_data?.last_name?.toLowerCase() || '';
      const email = c.entity_data?.email?.toLowerCase() || '';
      const phone = c.entity_data?.phone || '';
      const comp = c.entity_data?.company_name?.toLowerCase() || '';
      return fn.includes(q) || ln.includes(q) || email.includes(q) || phone.includes(q) || comp.includes(q);
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. TOP TOOLBAR & STATS HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="bg-transparent font-bold text-slate-100 text-base focus:outline-none cursor-pointer border-b border-dashed border-slate-700 hover:border-indigo-400 pb-0.5"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                    {b.name}
                  </option>
                ))}
              </select>
              <Badge variant="indigo" size="xs">
                {columns.length} Stages
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Drag cards to transition contacts between pipeline stages.</p>
          </div>
        </div>

        {/* Stats Summary Strip */}
        <div className="flex items-center gap-4 text-xs divide-x divide-slate-800">
          <div className="pr-4">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold block">Total Cards</span>
            <span className="font-bold text-slate-200 font-mono text-sm">{stats?.total_cards ?? 0}</span>
          </div>
          <div className="px-4">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold block">Win Rate</span>
            <span className="font-bold text-emerald-400 font-mono text-sm">{stats?.win_rate_percent ?? 0}%</span>
          </div>
          <div className="pl-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Layout className="w-3.5 h-3.5" />}
              onClick={() => setIsLayoutDesignerOpen(true)}
            >
              Card Layout
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                setWizardStep(1);
                setIsNewBoardWizardOpen(true);
              }}
            >
              New Board
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Density Sub-Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search cards..."
            value={cardSearch}
            onChange={(e) => setCardSearch(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Density:</span>
          <button
            onClick={() => setDensity('comfortable')}
            className={`px-2 py-1 rounded ${density === 'comfortable' ? 'bg-slate-800 text-slate-200 font-bold' : 'hover:text-slate-200'}`}
          >
            Comfortable
          </button>
          <button
            onClick={() => setDensity('compact')}
            className={`px-2 py-1 rounded ${density === 'compact' ? 'bg-slate-800 text-slate-200 font-bold' : 'hover:text-slate-200'}`}
          >
            Compact
          </button>
        </div>
      </div>

      {/* Undo Toast Notification */}
      {lastMoveAction && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 border border-indigo-500/80 rounded-xl px-4 py-3 shadow-2xl text-xs text-slate-200 animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Moved card to <strong>{lastMoveAction.targetColumnName}</strong></span>
          <button
            onClick={handleUndoMove}
            className="ml-2 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1 transition-all"
          >
            <Undo2 className="w-3 h-3" /> Undo
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. HORIZONTAL KANBAN COLUMNS */}
      {/* ========================================================================= */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-h-[600px] items-start">
          {columns.map((col) => {
            const rawCards = cardsByColumn[col.id] || [];
            const filtered = filterCards(rawCards);
            const isWipExceeded = col.wip_limit && rawCards.length > col.wip_limit;

            return (
              <div
                key={col.id}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnColumn(col.id)}
                className={`w-72 sm:w-80 shrink-0 bg-slate-900/70 border rounded-2xl flex flex-col max-h-[80vh] transition-all ${isWipExceeded ? 'border-rose-800/80 shadow-rose-950/20 shadow-md' : 'border-slate-800'
                  }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90 rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: col.color || '#6366f1' }}
                    />
                    <span className="font-bold text-xs text-slate-200 tracking-tight">{col.name}</span>
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
                      {rawCards.length}
                    </span>
                  </div>

                  {col.wip_limit && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isWipExceeded ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'text-slate-500'
                        }`}
                    >
                      WIP: {rawCards.length}/{col.wip_limit}
                    </span>
                  )}
                </div>

                {/* Cards List (Virtualized Scrollable) */}
                <div className="p-2 space-y-2 overflow-y-auto flex-1">
                  {filtered.map((card) => {
                    const d = card.entity_data || {};
                    const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unnamed Contact';
                    const initials = (d.first_name?.[0] || 'C') + (d.last_name?.[0] || '');

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card)}
                        onClick={() => setSelectedCardForDrawer(card)}
                        className={`bg-slate-950/90 border border-slate-800 hover:border-indigo-500/70 rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group ${density === 'compact' ? 'py-2' : 'py-3'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 font-bold text-[10px] flex items-center justify-center shrink-0 uppercase">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-slate-200 truncate group-hover:text-indigo-400 transition-colors">
                                {fullName}
                              </h4>
                              {d.company_name && (
                                <p className="text-[11px] text-slate-500 truncate">{d.company_name}</p>
                              )}
                            </div>
                          </div>

                          {d.lead_score !== undefined && d.lead_score > 0 && (
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${d.lead_score >= 80 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-slate-800 text-slate-300'
                                }`}
                            >
                              {d.lead_score}
                            </span>
                          )}
                        </div>

                        {density === 'comfortable' && (
                          <div className="mt-2.5 pt-2 border-t border-slate-900 text-xs text-slate-400 space-y-1">
                            {d.email && <div className="text-[11px] truncate text-slate-400">{d.email}</div>}
                            {d.phone && <div className="text-[11px] font-mono text-slate-500">{d.phone}</div>}
                          </div>
                        )}

                        {/* Quick Action Hover Bar */}
                        <div className="mt-2 pt-2 border-t border-slate-900/60 flex items-center justify-between text-[11px] text-slate-500">
                          {d.phone && onStartWhatsAppChat && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartWhatsAppChat(d.phone!);
                              }}
                              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                            >
                              <MessageCircle className="w-3 h-3" /> Chat
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardToMove(card);
                              setIsMoveCardModalOpen(true);
                            }}
                            className="text-slate-400 hover:text-slate-200 flex items-center gap-1 ml-auto"
                          >
                            <MoveRight className="w-3 h-3" /> Move
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="py-8 text-center text-slate-600 text-xs">
                      {cardSearch ? 'No matches' : 'Drop cards here'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. CARD DETAIL SIDE DRAWER */}
      {/* ========================================================================= */}
      <Drawer
        isOpen={Boolean(selectedCardForDrawer)}
        onClose={() => setSelectedCardForDrawer(null)}
        title={
          selectedCardForDrawer?.entity_data
            ? `${selectedCardForDrawer.entity_data.first_name || ''} ${selectedCardForDrawer.entity_data.last_name || ''}`.trim() || 'Contact Card'
            : 'Card Details'
        }
        subtitle={selectedCardForDrawer?.entity_data?.company_name || 'CRM Lead Record'}
        width="lg"
      >
        {selectedCardForDrawer && (
          <div className="space-y-6">
            {/* Stage Selector */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Current Pipeline Stage</label>
              <select
                value={selectedCardForDrawer.column_id}
                onChange={async (e) => {
                  const newColId = e.target.value;
                  await crmApi.moveBoardCard(selectedCardForDrawer.id, newColId, null, null);
                  setSelectedCardForDrawer((prev) => prev ? { ...prev, column_id: newColId } : null);
                  loadBoardDetails(selectedBoardId);
                }}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-bold"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Contact Bar */}
            {selectedCardForDrawer.entity_data?.phone && onStartWhatsAppChat && (
              <Button
                variant="success"
                size="sm"
                className="w-full"
                icon={<MessageCircle className="w-4 h-4" />}
                onClick={() => onStartWhatsAppChat(selectedCardForDrawer.entity_data!.phone!)}
              >
                Open WhatsApp Conversation
              </Button>
            )}

            {/* Field Details */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Primary Contact Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block">Email</span>
                  <span className="font-medium text-slate-200">{selectedCardForDrawer.entity_data?.email || 'N/A'}</span>
                </div>
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block">Phone</span>
                  <span className="font-medium text-slate-200 font-mono">{selectedCardForDrawer.entity_data?.phone || 'N/A'}</span>
                </div>
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block">Lead Score</span>
                  <span className="font-medium text-emerald-400 font-bold">{selectedCardForDrawer.entity_data?.lead_score ?? 0}</span>
                </div>
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block">Company</span>
                  <span className="font-medium text-slate-200">{selectedCardForDrawer.entity_data?.company_name || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Custom Super Fields */}
            {selectedCardForDrawer.entity_data?.custom_fields && (
              <div className="space-y-3 text-xs pt-4 border-t border-slate-800">
                <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Super Fields</h4>
                <div className="space-y-2">
                  {Object.entries(selectedCardForDrawer.entity_data.custom_fields).map(([k, v]) => (
                    <div key={k} className="flex justify-between p-2.5 rounded bg-slate-950/50 border border-slate-800">
                      <span className="text-slate-400 font-mono">{k}</span>
                      <strong className="text-slate-200">{String(v)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ========================================================================= */}
      {/* 4. GUIDED NEW BOARD WIZARD */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isNewBoardWizardOpen}
        onClose={() => setIsNewBoardWizardOpen(false)}
        title="Create New Kanban Board"
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label="Board Name"
            placeholder="e.g. Real Estate Sales Pipeline"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Choose Starting Template</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'sales_funnel', name: 'Sales Pipeline', cols: '6 stages' },
                { id: 'real_estate', name: 'Real Estate Deals', cols: '5 stages' },
                { id: 'support', name: 'Customer Support', cols: '4 stages' },
                { id: 'recruiting', name: 'Recruiting Tracker', cols: '5 stages' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`p-3 text-left rounded-xl border transition-all ${selectedTemplate === t.id
                    ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <div className="font-bold text-xs text-slate-200">{t.name}</div>
                  <div className="text-[10px] text-slate-500">{t.cols}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsNewBoardWizardOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newBoardName.trim()}
              onClick={handleFinishWizard}
            >
              Create Board
            </Button>
          </div>
        </div>
      </Modal>

      {/* Card Layout Designer Modal */}
      {isLayoutDesignerOpen && (
        <CardLayoutDesignerModal
          isOpen={isLayoutDesignerOpen}
          onClose={() => setIsLayoutDesignerOpen(false)}
          boardName={board?.name || 'Board'}
          layout={board?.card_layout_config}
          availableFields={availableSuperFields.map((f: any) => ({ slug: f.slug, name: f.name, field_type: f.field_type }))}
          onSave={async (layout) => {
            await crmApi.updateBoard(selectedBoardId, { card_layout_config: layout });
            await loadBoardDetails(selectedBoardId);
          }}
        />
      )}
    </div>
  );
};
