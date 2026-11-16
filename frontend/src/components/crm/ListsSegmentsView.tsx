import React, { useState } from 'react';
import { Layers, Plus, Trash2, RefreshCw, Filter, Users } from 'lucide-react';
import { crmApi, CrmList } from './crmApi';

interface ListsSegmentsViewProps {
  lists: CrmList[];
  onReload: () => void;
  onSelectList: (listId: string) => void;
}

export const ListsSegmentsView: React.FC<ListsSegmentsViewProps> = ({ lists, onReload, onSelectList }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [description, setDescription] = useState('');
  const [isDynamic, setIsDynamic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshingListId, setRefreshingListId] = useState<string | null>(null);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName.trim()) return;

    setIsCreating(true);
    try {
      const res = await crmApi.createList({
        name: listName.trim(),
        description: description.trim() || undefined,
        is_dynamic: isDynamic
      });

      if (res.success) {
        setListName('');
        setDescription('');
        setIsDynamic(false);
        setIsModalOpen(false);
        onReload();
      }
    } catch (err: any) {
      alert(`Failed to create list: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefreshCount = async (id: string) => {
    setRefreshingListId(id);
    try {
      await crmApi.refreshListCount(id);
      onReload();
    } catch (err: any) {
      alert(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshingListId(null);
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Delete this list? Contact records will remain safe.')) return;
    try {
      await crmApi.deleteList(id);
      onReload();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Static Lists & Dynamic Segments
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Static audience snapshots or real-time computed segments with cached counts
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
        >
          <Plus className="w-3.5 h-3.5" /> Create List / Segment
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lists.map((l) => (
          <div
            key={l.id}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-slate-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    l.is_dynamic ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {l.is_dynamic ? 'Dynamic Segment' : 'Static List'}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRefreshCount(l.id)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                    title="Refresh contact count"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingListId === l.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteList(l.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                    title="Delete list"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h4 className="text-sm font-bold text-slate-900 mt-2">{l.name}</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{l.description || 'No description provided'}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {l.cached_count.toLocaleString()} contacts
              </div>

              <button
                type="button"
                onClick={() => onSelectList(l.id)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                View Contacts &rarr;
              </button>
            </div>
          </div>
        ))}

        {lists.length === 0 && (
          <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-200/80 text-center text-slate-400 text-xs">
            No lists created yet. Create a static list or dynamic saved segment to organize your audience.
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-900">Create New List or Segment</h3>
            <form onSubmit={handleCreateList} className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">List Name</label>
                <input
                  type="text"
                  required
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="e.g. VIP Real Estate Buyers, High-Score Leads"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Purpose of this audience list..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dyn"
                  checked={isDynamic}
                  onChange={(e) => setIsDynamic(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <label htmlFor="dyn" className="font-semibold text-slate-700">
                  Dynamic Segment (Auto-membership based on filters)
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

