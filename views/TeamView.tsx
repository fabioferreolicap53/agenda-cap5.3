import React, { useState, useEffect } from 'react';
import { ViewState, User, Sector } from '../types';
import { supabase } from '../lib/supabase';

interface TeamViewProps {
  onChangeView: (view: ViewState) => void;
  currentUser: User | null;
  sectors: Sector[];
  onOpenModal?: (participants?: string[]) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const TeamView: React.FC<TeamViewProps> = ({ onChangeView, currentUser, sectors, onOpenModal, onNavigateToChat }) => {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string | 'Todos'>('Todos');
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [updatingRole, setUpdatingRole] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (error) throw error;

      if (data) {
        setMembers(data as User[]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar membros:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'Administrador' | 'Normal') => {
    if (!currentUser || currentUser.role !== 'Administrador') return;

    setUpdatingRole(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      // Update local state
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m));
      if (selectedMember && selectedMember.id === userId) {
        setSelectedMember({ ...selectedMember, role: newRole });
      }
    } catch (err: any) {
      console.error('Erro ao atualizar função:', err.message);
      alert('Erro ao atualizar permissão do usuário.');
    } finally {
      setUpdatingRole(false);
    }
  };

  // ... rendered component ...


  useEffect(() => {
    fetchMembers();
  }, []);

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.observations?.toLowerCase().includes(searchTerm.toLowerCase());

    if (selectedSectorId === 'Todos') return matchesSearch;
    return matchesSearch && member.sector_id === selectedSectorId;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-2 text-sm">
            <a onClick={() => onChangeView('calendar')} className="text-slate-500 hover:text-primary-dark transition-colors cursor-pointer text-xs font-bold uppercase tracking-wider">Home</a>
            <span className="text-slate-400">/</span>
            <span className="font-black text-slate-900 text-xs uppercase tracking-wider">Membros da Equipe</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              disabled={selectedMemberIds.length === 0}
              onClick={() => onOpenModal && onOpenModal(selectedMemberIds)}
              className="bg-primary-dark hover:bg-primary-light text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-primary-dark/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              Convidar {selectedMemberIds.length > 0 ? `(${selectedMemberIds.length})` : ''}
            </button>
          </div>
        </div>
      </header>

      <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
        {/* Filters */}
        <div className="mb-8 flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="w-full max-w-xl relative group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-dark transition-colors">search</span>
            <input
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary-dark/5 focus:border-primary-dark transition-all outline-none text-sm shadow-sm placeholder:text-slate-400"
              placeholder="Buscar membros por nome ou observações..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
            <span className="material-symbols-outlined text-primary-dark text-sm">groups</span>
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Membros: {filteredMembers.length}</span>
          </div>
        </div>

        {/* Chips */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-dark text-sm">filter_list</span>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Filtrar por Setor</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedSectorId('Todos')}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedSectorId === 'Todos' ? 'bg-primary-dark text-white border-primary-dark shadow-md' : 'bg-white text-slate-500 border-slate-100 hover:border-primary-dark/30'}`}
            >
              Todos
            </button>
            {sectors.map(sector => (
              <button
                key={sector.id}
                onClick={() => setSelectedSectorId(sector.id)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedSectorId === sector.id ? 'bg-primary-dark text-white border-primary-dark shadow-md' : 'bg-white text-slate-500 border-slate-100 hover:border-primary-dark/30'}`}
              >
                {sector.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-b-primary-dark"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Carregando Equipe...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-300">
            <span className="material-symbols-outlined text-6xl mb-4 opacity-20">person_search</span>
            <p className="font-black uppercase tracking-[0.2em] text-xs">Nenhum membro encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
            {filteredMembers.map(member => (
              <div key={member.id} className={`bg-white rounded-2xl border p-6 flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative group/card ${selectedMemberIds.includes(member.id) ? 'border-primary-dark ring-2 ring-primary-dark/20' : 'border-slate-100'}`}>
                {member.id !== currentUser?.id && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMemberIds(prev => [...prev, member.id]);
                        } else {
                          setSelectedMemberIds(prev => prev.filter(id => id !== member.id));
                        }
                      }}
                      className="size-5 rounded border-slate-300 text-primary-dark focus:ring-primary-dark cursor-pointer shadow-sm"
                    />
                  </div>
                )}
                {/* Also show checkbox if selected, even if not hovering */}
                {selectedMemberIds.includes(member.id) && member.id !== currentUser?.id && (
                  <div className="absolute top-3 right-3 z-10">
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => setSelectedMemberIds(prev => prev.filter(id => id !== member.id))}
                      className="size-5 rounded border-slate-300 text-primary-dark focus:ring-primary-dark cursor-pointer shadow-sm"
                    />
                  </div>
                )}
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary-dark/5 rounded-full scale-110 blur-md"></div>
                  <div
                    className="size-28 rounded-full border-4 border-white bg-cover bg-center shadow-lg relative z-10 bg-slate-100 flex items-center justify-center text-4xl font-black text-slate-300 uppercase"
                    style={{ backgroundImage: member.avatar ? `url('${member.avatar}')` : 'none' }}
                  >
                    {!member.avatar && (member.full_name ? member.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                  </div>
                  <div
                    className={`absolute bottom-1 right-1 size-6 border-4 border-white rounded-full z-20 shadow-sm ${{
                      'online': 'bg-emerald-500',
                      'busy': 'bg-rose-500',
                      'away': 'bg-amber-500',
                      'meeting': 'bg-purple-500',
                      'lunch': 'bg-blue-500',
                      'vacation': 'bg-indigo-500',
                      'out_of_office': 'bg-slate-500'
                    }[member.status || 'online']
                      }`}
                    title={
                      {
                        'online': 'Disponível',
                        'busy': 'Ocupado',
                        'away': 'Ausente',
                        'meeting': 'Em Reunião',
                        'lunch': 'Almoço',
                        'vacation': 'Férias',
                        'out_of_office': 'Em atividade externa'
                      }[member.status || 'online']
                    }
                  ></div>
                </div>

                <h3 className="text-base font-black text-slate-900 mb-0.5 truncate w-full px-2">{member.full_name}</h3>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${{
                  'online': 'text-emerald-500',
                  'busy': 'text-rose-500',
                  'away': 'text-amber-500',
                  'meeting': 'text-purple-500',
                  'lunch': 'text-blue-500',
                  'vacation': 'text-indigo-500',
                  'out_of_office': 'text-slate-500'
                }[member.status || 'online']
                  }`}>
                  {
                    {
                      'online': 'Disponível',
                      'busy': 'Ocupado',
                      'away': 'Ausente',
                      'meeting': 'Em Reunião',
                      'lunch': 'Almoço',
                      'vacation': 'Férias',
                      'out_of_office': 'Em atividade externa'
                    }[member.status || 'online']
                  }
                </p>
                <p className="text-[10px] text-slate-400 font-medium mb-3 -mt-2 truncate w-full px-4">{member.email}</p>

                <div className="px-3 py-1 bg-slate-50 rounded-lg mb-4">
                  <p className="text-[9px] font-black text-primary-dark/60 uppercase tracking-widest">
                    {sectors.find(s => s.id === member.sector_id)?.name || 'Sem Setor'}
                  </p>
                </div>

                <div className="w-full flex flex-col gap-2 mt-auto">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mb-4 min-h-[30px] line-clamp-2">
                    {member.observations || 'Nenhuma observação definida.'}
                  </p>
                  <button
                    onClick={() => setSelectedMember(member)}
                    className="w-full bg-primary-dark hover:bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-md active:scale-95"
                  >
                    Ver Perfil
                  </button>
                  {onNavigateToChat && member.id !== currentUser?.id && (
                    <button
                      onClick={() => onNavigateToChat(member.id)}
                      className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-slate-100 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">chat</span>
                      Mensagem
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member Profile Modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-[zoomIn_0.3s_ease-out] relative border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header/Background */}
            <div className="h-32 bg-gradient-to-br from-primary-dark to-primary-light relative">
              <button
                onClick={() => setSelectedMember(null)}
                className="absolute top-4 right-4 size-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors z-10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Profile Info */}
            <div className="px-8 pb-10 pt-0 flex flex-col items-center -mt-16 relative">
              <div
                className="size-32 rounded-full border-4 border-white bg-cover bg-center shadow-2xl mb-4 bg-slate-100 flex items-center justify-center text-4xl font-black text-slate-300 uppercase relative"
                style={{ backgroundImage: selectedMember.avatar ? `url('${selectedMember.avatar}')` : 'none' }}
              >
                {!selectedMember.avatar && (selectedMember.full_name ? selectedMember.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                <div
                  className={`absolute bottom-3 right-3 size-6 border-4 border-white rounded-full z-20 shadow-sm ${{
                    'online': 'bg-emerald-500',
                    'busy': 'bg-rose-500',
                    'away': 'bg-amber-500',
                    'meeting': 'bg-purple-500',
                    'lunch': 'bg-blue-500',
                    'vacation': 'bg-indigo-500',
                    'out_of_office': 'bg-slate-500'
                  }[selectedMember.status || 'online']
                    }`}
                  title={
                    {
                      'online': 'Disponível',
                      'busy': 'Ocupado',
                      'away': 'Ausente',
                      'meeting': 'Em Reunião',
                      'lunch': 'Almoço',
                      'vacation': 'Férias',
                      'out_of_office': 'Em atividade externa'
                    }[selectedMember.status || 'online']
                  }
                ></div>
              </div>

              <h2 className="text-xl font-black text-slate-900 mb-0.5">{selectedMember.full_name}</h2>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${{
                'online': 'text-emerald-500',
                'busy': 'text-rose-500',
                'away': 'text-amber-500',
                'meeting': 'text-purple-500',
                'lunch': 'text-blue-500',
                'vacation': 'text-indigo-500',
                'out_of_office': 'text-slate-500'
              }[selectedMember.status || 'online']
                }`}>
                {
                  {
                    'online': 'Disponível',
                    'busy': 'Ocupado',
                    'away': 'Ausente',
                    'meeting': 'Em Reunião',
                    'lunch': 'Almoço',
                    'vacation': 'Férias',
                    'out_of_office': 'Em atividade externa'
                  }[selectedMember.status || 'online']
                }
              </p>
              {selectedMember.username && (
                <span className="text-xs font-bold text-primary-dark bg-primary-dark/5 px-2.5 py-0.5 rounded-full mb-4">
                  @{selectedMember.username}
                </span>
              )}

              <div className="w-full space-y-4 text-center mt-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Setor</span>
                  <p className="text-xs font-bold text-slate-700">
                    {sectors.find(s => s.id === selectedMember.sector_id)?.name || 'Sem Setor'}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Perfil</span>
                  <p className="text-xs font-bold text-slate-700">{selectedMember.role === 'Administrador' ? '🚀 Administrador' : '👥 Membro Normal'}</p>
                </div>

                <div className="pt-4 border-t border-slate-100 w-full">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Observações</span>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl text-left italic">
                    {selectedMember.observations || 'Nenhuma observação detalhada para este membro.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedMember(null)}
                className="mt-8 w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95"
              >
                Fechar Perfil
              </button>
              {onNavigateToChat && selectedMember.id !== currentUser?.id && (
                <button
                  onClick={() => {
                    onNavigateToChat(selectedMember.id);
                    setSelectedMember(null);
                  }}
                  className="mt-2 w-full bg-white hover:bg-slate-50 text-primary-dark border-2 border-primary-dark/20 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">chat</span>
                  Conversar agora
                </button>
              )}
            </div>
          </div>
          {/* Backdrop click to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setSelectedMember(null)}></div>
        </div>
      )}
    </div>
  );
};
