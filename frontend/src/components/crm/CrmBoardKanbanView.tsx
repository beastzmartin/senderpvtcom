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
  DollarSign
} from 'lucide-react';
import { crmApi } from './crmApi';
import { CardLayoutDesignerModal } from './CardLayoutDesignerModal';

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

  // Modals & Popups
  const [isLayoutDesignerOpen, setIsLayoutDesignerOpen] = useState(false);
  const [isNewBoardModalOpen, setIsNewBoardModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('sales_funnel');
  const [isMoveCardModalOpen, setIsMoveCardModalOpen] = useState(false);
  const [cardToMove, setCardToMove] = useState<BoardCard | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);

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
          // Auto create default board from sales funnel template
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

        // Fetch cards for each column
        const cardMap: Record<string, BoardCard[]> = {};
        for (const col of cols) {
          const cardsRes = await crmApi.listBoardCards(bId, col.id, undefined, 40);
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

    // Find card
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

    // Optimistic UI update
    const sourceCards = cardsByColumn[sourceColumnId].filter((c) => c.id !== targetCard!.id);
    const targetCards = [...(cardsByColumn[targetColumnId] || []), { ...targetCard, column_id: targetColumnId }];

    setCardsByColumn((prev) => ({
      ...prev,
      [sourceColumnId]: sourceCards,
      [targetColumnId]: targetCards
    }));

    try {
      const lastRank = targetCards.length > 1 ? targetCards[targetCards.length - 2].rank : null;
      await crmApi.moveBoardCard(targetCard.id, targetColumnId, lastRank, null);
    } catch (err) {
      console.error('Failed to move card:', err);
      // Revert on error
      loadBoardDetails(selectedBoardId);
    } finally {
      setDraggedCardId(null);
    }
  };

  const handleQuickMove = async (targetColumnId: string) => {
    if (!cardToMove) return;
    const sourceColId = cardToMove.column_id;

    // Optimistic update
    setCardsByColumn((prev) => ({
      ...prev,
      [sourceColId]: (prev[sourceColId] || []).filter((c) => c.id !== cardToMove.id),
      [targetColumnId]: [...(prev[targetColumnId] || []), { ...cardToMove, column_id: targetColumnId }]
    }));

    setIsMoveCardModalOpen(false);
    try {
      await crmApi.moveBoardCard(cardToMove.id, targetColumnId);
    } catch (err) {
      console.error('Move failed:', err);
      loadBoardDetails(selectedBoardId);
    } finally {
      setCardToMove(null);
    }
  };

  const handleCreateNewBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      const res = await crmApi.createBoardFromTemplate(selectedTemplate, newBoardName);
      if (res && res.success && res.board) {
        setBoards((prev) => [res.board, ...prev]);
        setSelectedBoardId(res.board.id);
        setIsNewBoardModalOpen(false);
        setNewBoardName('');
      }
    } catch (err: any) {
      alert(`Error creating board: ${err.message}`);
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim() || !selectedBoardId) return;
    try {
      const res = await crmApi.createBoardColumn(selectedBoardId, {
        name: newColumnName,
        order_index: columns.length,
        stage_type: 'standard',
        color: '#6366f1'
      });
      if (res && res.success && res.column) {
        setColumns((p) => [...p, res.column]);
        setCardsByColumn((p) => ({ ...p, [res.column.id]: [] }));
        setNewColumnName('');
        setIsAddColumnOpen(false);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleSaveLayout = async (newLayout: any) => {
    if (!selectedBoardId) return;
    await crmApi.updateBoard(selectedBoardId, { card_layout: newLayout });
    setBoard((prev: any) => ({ ...prev, card_layout: newLayout }));
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Board Controls */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xs">
            <Kanban className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="text-base font-black text-slate-900 bg-transparent border-none focus:ring-0 cursor-pointer pr-8"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                LexoRank O(1)
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {board?.description || 'Enterprise visual sales and contacts pipeline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLayoutDesignerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <Layout className="w-4 h-4 text-slate-500" />
            Card Layout
          </button>

          <button
            type="button"
            onClick={() => setIsNewBoardModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            New Board
          </button>
        </div>
      </div>

      {/* Stats Header Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Cards</p>
              <h4 className="text-xl font-black text-slate-900">{stats.total_cards || 0}</h4>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Won Deals</p>
              <h4 className="text-xl font-black text-emerald-600">{stats.won_count || 0}</h4>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Win Rate</p>
              <h4 className="text-xl font-black text-indigo-600">{stats.win_rate_percent || 0}%</h4>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Columns</p>
              <h4 className="text-xl font-black text-slate-900">{columns.length}</h4>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
              <Kanban className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board Columns Container */}
      <div className="flex gap-4 overflow-x-auto pb-6 min-h-[600px] select-none">
        {columns.map((col) => {
          const cards = cardsByColumn[col.id] || [];
          const isWipExceeded = col.wip_limit && cards.length > col.wip_limit;

          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={() => handleDropOnColumn(col.id)}
              className="w-80 shrink-0 flex flex-col bg-slate-100/70 border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs"
            >
              {/* Column Header */}
              <div className="p-4 bg-white border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: col.color || '#6366f1' }}
                  />
                  <h3 className="font-bold text-sm text-slate-800 truncate">{col.name}</h3>
                  <span className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {cards.length}
                  </span>
                </div>

                {col.wip_limit && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isWipExceeded ? 'bg-rose-100 text-rose-700 font-black' : 'bg-slate-100 text-slate-500'
                      }`}
                  >
                    WIP: {cards.length}/{col.wip_limit}
                  </span>
                )}
              </div>

              {/* Cards List (Infinite Scroll / Keyset Container) */}
              <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-340px)]">
                {cards.map((card) => {
                  const contact = card.entity_data || {};
                  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed Contact';
                  const layout = board?.card_layout || {};

                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, card)}
                      onClick={() => onSelectContact && onSelectContact(card.entity_id)}
                      className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition cursor-grab active:cursor-grabbing group relative"
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {layout.show_avatar !== false && (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white text-[11px] font-bold flex items-center justify-center">
                              {fullName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="font-bold text-slate-900 text-xs truncate max-w-[140px]">
                            {fullName}
                          </div>
                        </div>

                        {layout.show_score !== false && contact.lead_score !== undefined && (
                          <span

                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${contact.lead_score >= 80
                                ? 'bg-emerald-100 text-emerald-800'
                                : contact.lead_score >= 50
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                          >
                            {contact.lead_score} pts
                          </span>
                        )}
                      </div>

                      {/* Visible Field Properties */}
                      <div className="space-y-1 mb-3 text-xs text-slate-600">
                        {contact.email && (
                          <p className="truncate text-slate-500 font-medium">✉ {contact.email}</p>
                        )}
                        {contact.phone && (
                          <p className="truncate text-slate-500 font-medium">☎ {contact.phone}</p>
                        )}
                      </div>

                      {/* Action Buttons Row */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                        {contact.phone && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onStartWhatsAppChat) onStartWhatsAppChat(contact.phone!);
                              else window.open(`https://wa.me/${contact.phone!.replace(/[^0-9]/g, '')}`, '_blank');
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-xl transition"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Chat
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardToMove(card);
                            setIsMoveCardModalOpen(true);
                          }}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-xl transition"
                        >
                          <MoveRight className="w-3.5 h-3.5" />
                          Move
                        </button>
                      </div>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-400 font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                    Drop cards here
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Column Button */}
        <div className="w-72 shrink-0">
          {isAddColumnOpen ? (
            <div className="p-4 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Column Name..."
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 font-medium"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="flex-1 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddColumnOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddColumnOpen(true)}
              className="w-full py-4 rounded-3xl border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </button>
          )}
        </div>
      </div>

      {/* Card Layout Designer Modal */}
      {board && (
        <CardLayoutDesignerModal
          isOpen={isLayoutDesignerOpen}
          onClose={() => setIsLayoutDesignerOpen(false)}
          boardName={board.name}
          layout={board.card_layout}
          availableFields={availableSuperFields}
          onSave={handleSaveLayout}
        />
      )}

      {/* Quick Move Card Picker Modal */}
      {isMoveCardModalOpen && cardToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Move Card to Stage</h3>
            <div className="space-y-2">
              {columns.map((col) => (
                <button
                  key={col.id}
                  type="button"

                  onClick={() => handleQuickMove(col.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border text-xs font-bold transition ${cardToMove.column_id === col.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                    {col.name}
                  </span>
                  {cardToMove.column_id === col.id && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsMoveCardModalOpen(false);
                setCardToMove(null);
              }}
              className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Board Modal */}
      {isNewBoardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                <Kanban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Create New Kanban Board</h3>
                <p className="text-xs text-slate-500">Pick a business template to scaffold stages instantly</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Board Name</label>
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="e.g. Enterprise Q3 Pipeline"
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Preset Template</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'sales_funnel', label: 'Sales Funnel' },
                  { id: 'real_estate', label: 'Real Estate' },
                  { id: 'customer_support', label: 'Support & Tickets' },
                  { id: 'recruiting', label: 'Hiring Pipeline' }
                ].map((t) => (
                  <button
                    key={t.id}

                    type="button"
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`p-3 rounded-2xl border text-left text-xs font-bold transition ${selectedTemplate === t.id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewBoardModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewBoard}
                className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Create Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

