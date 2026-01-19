import React, { useState } from 'react';
import { ViewState, User, Sector } from '../types';
import { NotificationCenter } from './NotificationCenter';
import { supabase } from '../lib/supabase';
import { STATUS_OPTIONS } from '../constants';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onLogout?: () => void;
  user?: User | null;
  sectors: Sector[];
  selectedSectorIds: string[];
  onFilterChange: (ids: string[]) => void;
  onViewAppointment: (id: string) => void;
  onUpdateProfile?: () => void;
  onNavigateToChat?: (userId: string) => void;
  unreadCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onChangeView,
  onLogout,
  user,
  sectors,
  selectedSectorIds,
  onFilterChange,
  onViewAppointment,
  onUpdateProfile,
  onNavigateToChat,
  unreadCount = 0,
  isOpen,
  onClose
}) => {
  const navItemClass = (view: ViewState, isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative ${isActive
      ? 'bg-primary-dark text-white font-bold shadow-lg shadow-primary-dark/10'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-medium'
    }`;

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.profile-menu-container')) {
        setShowProfileMenu(false);
        setShowStatusMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const [members, setMembers] = useState<User[]>([]);

  React.useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (data) {
        setMembers(data as User[]);
      }
    };

    fetchMembers();

    // Subscribe to profile changes for real-time status updates
    const subscription = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchMembers();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);



  // Removed local statusOptions definition


  const handleUpdateStatus = async (statusId: string) => {
    if (!user) return;
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: statusId })
        .eq('id', user.id);

      if (error) throw error;
      onUpdateProfile?.();
      // Keep menu open for visual feedback of the "check" mark, or close it?
      // User said "it's not possible to select", usually implies it closes without updating
      // or doesn't react. I'll close it after a short delay for feedback.
      setTimeout(() => {
        setShowStatusMenu(false);
        setShowProfileMenu(false);
      }, 300);
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err.message);
    } finally {
      setUpdatingStatus(true); // Keep it "loading" briefly during feedback
      setTimeout(() => setUpdatingStatus(false), 300);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const toggleSector = (id: string) => {
    if (selectedSectorIds.includes(id)) {
      onFilterChange(selectedSectorIds.filter(sId => sId !== id));
    } else {
      onFilterChange([...selectedSectorIds, id]);
    }
  };

  const isFilterableView = currentView === 'calendar' || currentView === 'list';

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden animate-[fadeIn_0.2s_ease-out]"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-white flex flex-col h-full z-50 transform transition-transform duration-300 ease-out
        md:relative md:translate-x-0 md:w-64 md:border-r md:border-slate-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] md:z-20
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-4 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-4 pl-1">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center size-8 bg-gradient-to-br from-primary-dark to-primary-light rounded-lg text-white shadow-lg shadow-primary-dark/10">
                <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs font-black tracking-[0.15em] text-slate-900 leading-none uppercase">
                  Agenda
                </h1>
                <span className="text-[10px] font-black text-primary-dark uppercase tracking-[0.15em] mt-1">
                  CAP5.3
                </span>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="md:hidden size-8 flex items-center justify-center rounded-lg hover:bg-slate-50 text-slate-400 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <nav className="space-y-0.5 mb-4">
            <p className="px-3 text-[8px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-1.5">Menu Principal</p>
            <button
              onClick={() => { onChangeView('calendar'); onClose?.(); }}
              className={navItemClass('calendar', currentView === 'calendar')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'calendar' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>calendar_month</span>
              <span className="text-xs">Calendário</span>
            </button>
            <button
              onClick={() => { onChangeView('list'); onClose?.(); }}
              className={navItemClass('list', currentView === 'list')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'list' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>view_list</span>
              <span className="text-xs">Lista de Compromissos</span>
            </button>
            <button
              onClick={() => { onChangeView('team'); onClose?.(); }}
              className={navItemClass('team', currentView === 'team')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'team' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>group</span>
              <span className="text-xs">Equipe</span>
            </button>
            <button
              onClick={() => { onChangeView('messages'); onClose?.(); }}
              className={navItemClass('messages', currentView === 'messages')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'messages' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>chat</span>
              <span className="text-xs">Mensagens</span>
              {unreadCount > 0 && (
                <span className="absolute right-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { onChangeView('performance'); onClose?.(); }}
              className={navItemClass('performance', currentView === 'performance')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'performance' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>analytics</span>
              <span className="text-xs">Estatísticas</span>
            </button>
            <button
              onClick={() => { onChangeView('settings'); onClose?.(); }}
              className={navItemClass('settings', currentView === 'settings')}
            >
              <span className={`material-symbols-outlined text-[16px] ${currentView === 'settings' ? 'text-white' : 'text-slate-400 group-hover:text-primary-dark'}`}>settings</span>
              <span className="text-xs">Configurações</span>
            </button>
          </nav>

          <NotificationCenter user={user || null} onViewAppointment={onViewAppointment} onNavigateToChat={onNavigateToChat} />

          {isFilterableView && (
            <div className="mb-4 animate-[fadeIn_0.5s] border-t border-slate-50 pt-3">
              <div className="flex items-center justify-between px-3 mb-2">
                <h3 className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.15em]">Filtro por Setor</h3>
                {selectedSectorIds.length > 0 && (
                  <button
                    onClick={() => onFilterChange([])}
                    className="text-[9px] font-bold text-red-500 hover:text-red-600 hover:underline"
                  >
                    Limpar todos
                  </button>
                )}
              </div>
              <div className="space-y-0 px-0.5">
                {sectors.map((sector) => (
                  <label
                    key={sector.id}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg cursor-pointer transition-all ${selectedSectorIds.includes(sector.id) ? 'bg-primary-dark/5' : 'hover:bg-slate-50'}`}
                  >
                    <div className="relative flex items-center">
                      <input
                        checked={selectedSectorIds.includes(sector.id)}
                        onChange={() => toggleSector(sector.id)}
                        className="peer h-3 w-3 shrink-0 appearance-none rounded border border-slate-300 bg-white checked:bg-primary-dark checked:border-primary-dark transition-all focus:outline-none"
                        type="checkbox"
                      />
                      <span className="material-symbols-outlined absolute left-0 text-[12px] text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none">check</span>
                    </div>
                    <span className={`text-[10px] font-semibold transition-colors ${selectedSectorIds.includes(sector.id) ? 'text-slate-900' : 'text-slate-500'}`}>
                      {sector.name}
                    </span>
                  </label>
                ))}
                {sectors.length === 0 && (
                  <p className="px-3 text-[9px] text-slate-400 italic">Carregando setores...</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-2.5 bg-slate-50/50 border-t border-slate-100 relative group profile-menu-container">
          {showProfileMenu && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-slate-100 p-1 z-30 animate-[slideUp_0.15s_ease-out]">
              {!showStatusMenu ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStatusMenu(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors group/item"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover/item:text-primary-dark">account_circle</span>
                      Status
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] uppercase tracking-widest ${STATUS_OPTIONS.find(s => s.id === (user?.status || 'online'))?.color}`}>
                        {STATUS_OPTIONS.find(s => s.id === (user?.status || 'online'))?.label}
                      </span>
                      <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                    </div>
                  </button>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Sair da conta
                  </button>
                </>
              ) : (
                <div className="p-1" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-2 px-2 py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStatusMenu(false);
                      }}
                      className="size-6 flex items-center justify-center hover:bg-slate-100 rounded-full text-slate-400"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecionar Status</span>
                  </div>
                  <div className="space-y-0.5">
                    {STATUS_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateStatus(option.id);
                        }}
                        disabled={updatingStatus}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${user?.status === option.id ? 'bg-primary-dark/5 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                      >
                        <span className={`material-symbols-outlined text-[18px] ${option.color}`}>{option.icon}</span>
                        {option.label}
                        {user?.status === option.id && <span className="material-symbols-outlined text-[14px] ml-auto text-primary-dark">check</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowStatusMenu(false);
            }}
            className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white hover:shadow-sm cursor-pointer transition-all duration-200 border border-transparent hover:border-slate-100"
          >
            <div className="relative shrink-0">
              {user?.avatar ? (
                <div
                  className="size-8 rounded-full bg-cover bg-center border border-white shadow-sm"
                  style={{ backgroundImage: `url('${user.avatar}')` }}
                ></div>
              ) : (
                <div className="size-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">
                  {user?.full_name ? getInitials(user.full_name) : 'U'}
                </div>
              )}
              <div className={`absolute -bottom-0.5 -right-0.5 size-3 border-2 border-white rounded-full bg-white flex items-center justify-center shadow-sm`}>
                <span className={`material-symbols-outlined text-[10px] font-black ${STATUS_OPTIONS.find(s => s.id === (user?.status || 'online'))?.color}`}>
                  {STATUS_OPTIONS.find(s => s.id === (user?.status || 'online'))?.icon}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black truncate text-slate-900 leading-tight mb-0.5">
                {user?.full_name || 'Usuário'}
              </p>
              <p className="text-[9px] text-slate-500 font-medium truncate mb-0.5" title={user?.observations}>
                {user?.observations || 'Sem observações'}
              </p>
              <p className="text-[9px] font-black text-slate-400 truncate tracking-widest uppercase">
                {STATUS_OPTIONS.find(s => s.id === (user?.status || 'online'))?.label}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
