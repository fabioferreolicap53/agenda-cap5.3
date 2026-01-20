import React, { useState, useEffect } from 'react';
import { ViewState, User, Appointment, AppointmentType, Attendee, Location } from '../types';
import { supabase } from '../lib/supabase';
import { Footer } from '../components/Footer';

interface AppointmentDetailViewProps {
  onBack: () => void;
  appointment: Appointment;
  user: User | null;
  appointmentTypes: AppointmentType[];
  onNavigateToChat?: (userId: string) => void;
  onDuplicate?: (appointment: Appointment) => void;
}

export const AppointmentDetailView: React.FC<AppointmentDetailViewProps> = ({
  onBack,
  appointment,
  user,
  appointmentTypes,
  onNavigateToChat,
  onDuplicate
}) => {
  const isOwner = user?.id === appointment.created_by;
  const isAdmin = user?.role === 'Administrador';
  const canEdit = isOwner || isAdmin;
  const [organizer, setOrganizer] = useState<User | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [location, setLocation] = useState<{ name: string, color: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(appointment.title);
  const [editDescription, setEditDescription] = useState(appointment.description || '');
  const [editDate, setEditDate] = useState(appointment.date);
  const [editStartTime, setEditStartTime] = useState(appointment.startTime);
  const [editEndTime, setEditEndTime] = useState(appointment.endTime || '');
  const [editType, setEditType] = useState(appointment.type);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editLocationId, setEditLocationId] = useState(appointment.location_id || '');

  const [allProfiles, setAllProfiles] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [attendeeSearchTerm, setAttendeeSearchTerm] = useState('');

  const fetchOrganizerAndAttendees = async () => {
    // Fetch Organizer
    const { data: orgData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', appointment.created_by)
      .single();

    if (orgData) {
      setOrganizer({
        id: orgData.id,
        full_name: orgData.full_name,
        role: orgData.role,
        email: '',
        observations: orgData.observations,
        avatar: orgData.avatar
      });
    }

    // Fetch latest appointment data (to ensure we have location_id)
    const { data: currentApp } = await supabase
      .from('appointments')
      .select('location_id')
      .eq('id', appointment.id)
      .single();

    const locationId = currentApp?.location_id || appointment.location_id;

    // Fetch Location if exists
    if (locationId) {
      setEditLocationId(locationId); // Sync edit state
      const { data: locData } = await supabase
        .from('locations')
        .select('name, color')
        .eq('id', locationId)
        .single();

      if (locData) setLocation(locData);
    } else {
      setEditLocationId(''); // Sync edit state
      setLocation(null);
    }

    // Fetch Attendees
    try {
      const { data: attData, error: attError } = await supabase
        .from('appointment_attendees')
        .select('*')
        .eq('appointment_id', appointment.id);

      if (attError) throw attError;

      if (attData) {
        setAttendees(attData as Attendee[]);
        setSelectedUserIds(attData.map(a => a.user_id));
      }
    } catch (err: any) {
      console.error('Erro ao buscar participantes:', err.message);
    }
  };

  const fetchAllProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    if (data) {
      setAllProfiles(data.map(d => ({
        id: d.id,
        full_name: d.full_name,
        role: d.role,
        email: '',
        observations: d.observations,
        avatar: d.avatar,
        username: d.username
      })));
    }

    // Also fetch all locations for editing
    const { data: locs } = await supabase.from('locations').select('*').order('name');
    if (locs) setLocations(locs);
  };

  useEffect(() => {
    fetchOrganizerAndAttendees();
    fetchAllProfiles();

    // Real-time subscription for attendee updates
    const channel = supabase.channel(`appointment_attendees_${appointment.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointment_attendees',
        filter: `appointment_id=eq.${appointment.id}`
      }, () => {
        fetchOrganizerAndAttendees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment.id]);

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja excluir este compromisso?')) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointment.id);

      if (error) throw error;
      onBack();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Ensure end_time is not null. If missing, default to start_time + 1 hour
      let finalEndTime = editEndTime;
      if (!finalEndTime && editStartTime) {
        const [h, m] = editStartTime.split(':').map(Number);
        const newH = (h + 1) % 24;
        finalEndTime = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }

      if (!finalEndTime) {
        throw new Error("O horário de término é obrigatório.");
      }

      // 1. Update Appointment Information
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          title: editTitle,
          description: editDescription,
          date: editDate,
          start_time: editStartTime,
          end_time: finalEndTime,
          type: editType,
          location_id: editLocationId || null
        })
        .eq('id', appointment.id);

      if (updateError) throw updateError;

      // 2. Manage Attendees
      const currentAttendeeIds = attendees.map(a => a.user_id);

      // Ensure unique IDs from selection and filter out existing ones
      const uniqueSelectedIds = Array.from(new Set(selectedUserIds));
      const toAdd = uniqueSelectedIds.filter(id => !currentAttendeeIds.includes(id));
      const toRemove = currentAttendeeIds.filter(id => !uniqueSelectedIds.includes(id));

      if (toAdd.length > 0) {
        const newAttendees = toAdd.map(uid => ({
          appointment_id: appointment.id,
          user_id: uid,
          status: 'pending'
        }));
        const { error: addError } = await supabase.from('appointment_attendees').insert(newAttendees);
        if (addError) throw addError;
      }

      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('appointment_attendees')
          .delete()
          .eq('appointment_id', appointment.id)
          .in('user_id', toRemove);
        if (removeError) throw removeError;
      }

      alert('Compromisso atualizado com sucesso!');
      setIsEditing(false);
      fetchOrganizerAndAttendees();
    } catch (err: any) {
      alert('Erro ao atualizar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleResponse = async (status: 'accepted' | 'declined') => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('appointment_attendees')
        .update({ status })
        .eq('appointment_id', appointment.id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh the list to show the new status immediately
      await fetchOrganizerAndAttendees();
    } catch (err: any) {
      alert('Erro ao responder convite: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestParticipation = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('appointment_attendees').insert({
        appointment_id: appointment.id,
        user_id: user.id,
        status: 'requested'
      });

      if (error) throw error;

      alert('Solicitação enviada com sucesso! O organizador será notificado.');
      await fetchOrganizerAndAttendees();
    } catch (err: any) {
      alert('Erro ao solicitar participação: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManageRequest = async (userId: string, status: 'accepted' | 'declined') => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('appointment_attendees')
        .update({ status })
        .eq('appointment_id', appointment.id)
        .eq('user_id', userId);

      if (error) throw error;
      await fetchOrganizerAndAttendees();
    } catch (err: any) {
      alert('Erro ao gerenciar solicitação: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const myAttendeeRecord = attendees.find(a => a.user_id === user?.id);

  const getTypeLabel = (type: string) => {
    const normalize = (str: string) => str.toLowerCase().trim();
    const normalizedType = normalize(type);

    // 1. Direct match
    const match = appointmentTypes.find(t => normalize(t.value) === normalizedType);
    if (match) return match.label;

    // 2. Legacy/Fallback mapping
    if (normalizedType === 'planning') {
      const planningMatch = appointmentTypes.find(t =>
        normalize(t.value).includes('planej') || normalize(t.label).includes('planej')
      );
      if (planningMatch) return planningMatch.label;
      return 'Planejamento';
    }

    return type;
  };

  const getTypeColor = (type: string) => {
    const normalize = (str: string) => str.toLowerCase().trim();
    const normalizedType = normalize(type);

    // 1. Direct match
    const match = appointmentTypes.find(t => normalize(t.value) === normalizedType);
    if (match) return match.color;

    // 2. Legacy/Fallback mapping
    if (normalizedType === 'planning') {
      const planningMatch = appointmentTypes.find(t =>
        normalize(t.value).includes('planej') || normalize(t.label).includes('planej')
      );
      if (planningMatch) return planningMatch.color;
    }

    return '#1e293b';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getDay = (dateStr: string) => {
    return dateStr.split('-')[2];
  };

  const getMonthName = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  };

  return (
    <div className="bg-surface font-sans text-slate-900 min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-solid border-slate-200 px-6 md:px-10 py-4 bg-white sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="size-8 bg-primary-dark rounded-lg flex items-center justify-center text-white cursor-pointer" onClick={onBack}>
              <span className="material-symbols-outlined text-xl">event</span>
            </div>
            <h2 className="text-xl font-black leading-tight tracking-[-0.015em] text-primary-dark uppercase">Agenda CAP5.3</h2>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 w-full animate-[fadeIn_0.3s_ease-out]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-slate-900/10 active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Voltar
            </button>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => onDuplicate && onDuplicate(appointment)}
                    className="flex items-center gap-2 bg-primary-dark/10 hover:bg-primary-dark/20 text-primary-dark font-bold px-6 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                    title="Duplicar Compromisso"
                  >
                    <span className="material-symbols-outlined text-xl">content_copy</span>
                    Duplicar
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 bg-primary-dark hover:bg-primary-light text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-xl">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-2.5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded-xl transition-all group"
                    title="Excluir Compromisso"
                  >
                    <span className="material-symbols-outlined group-hover:scale-110 transition-transform">delete</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-xl">save</span>
                    {loading ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span
              className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
              style={{ backgroundColor: getTypeColor(appointment.type) + '15', color: getTypeColor(appointment.type), borderColor: getTypeColor(appointment.type) + '30' }}
            >
              {getTypeLabel(appointment.type)}
            </span>
            {(isOwner || myAttendeeRecord) && (
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1.5">
                <span className="size-2 bg-emerald-500 rounded-full"></span>
                {isOwner ? 'Organizador' : (myAttendeeRecord?.status === 'accepted' ? 'Confirmado' : (myAttendeeRecord?.status === 'declined' ? 'Recusado' : (myAttendeeRecord?.status === 'requested' ? 'Solicitado' : 'Convidado')))}
              </span>
            )}
          </div>
          {!isEditing ? (
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-primary-dark mb-2">{appointment.title}</h1>
          ) : (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-3xl md:text-4xl font-extrabold leading-tight text-primary-dark mb-2 border-b-2 border-primary-dark focus:outline-none bg-transparent"
              placeholder="Título do compromisso"
            />
          )}

          {!isEditing ? (
            <p className="text-lg text-slate-500 font-medium">{appointment.description ? 'Informações detalhadas' : 'Sem descrição'}</p>
          ) : (
            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Tipo de Evento</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-dark outline-none text-sm"
              >
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {!isOwner && !myAttendeeRecord && (
            <div className="mt-6 flex items-center gap-4 p-4 bg-primary-dark/5 rounded-2xl border border-primary-dark/10">
              <div className="flex-1">
                <p className="text-sm font-bold text-primary-dark">Gostaria de participar deste evento?</p>
                <p className="text-xs text-slate-500 mt-1">Solicite ao organizador para ser incluído.</p>
              </div>
              <button
                onClick={handleRequestParticipation}
                disabled={loading}
                className="px-4 py-2 bg-primary-dark hover:bg-primary-light text-white text-xs font-bold rounded-lg transition-all shadow-sm"
              >
                Solicitar Participação
              </button>
            </div>
          )}

          {!isOwner && myAttendeeRecord?.status === 'requested' && (
            <div className="mt-6 flex items-center gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <span className="material-symbols-outlined text-amber-500">hourglass_top</span>
              <div>
                <p className="text-sm font-bold text-amber-700">Solicitação enviada</p>
                <p className="text-xs text-amber-600">Aguardando aprovação do organizador.</p>
              </div>
            </div>
          )}

          {!isOwner && myAttendeeRecord?.status === 'pending' && (
            <div className="mt-6 flex items-center gap-4 p-4 bg-primary-dark/5 rounded-2xl border border-primary-dark/10">
              <p className="text-sm font-bold text-primary-dark flex-1">Você foi convidado para este compromisso. Deseja participar?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResponse('accepted')}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => handleResponse('declined')}
                  disabled={loading}
                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                >
                  Recusar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data, Hora e Local</h3>
              </div>
              <div className="p-8 flex flex-col gap-6">
                <div className="flex items-start gap-6">
                  <div className="size-16 rounded-2xl bg-primary-dark flex flex-col items-center justify-center text-white shadow-lg shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-tighter opacity-80">{getMonthName(appointment.date)}</span>
                    <span className="text-2xl font-black">{getDay(appointment.date)}</span>
                  </div>
                  <div className="flex flex-col justify-center">
                    {!isEditing ? (
                      <>
                        <p className="text-xl font-bold text-primary-dark capitalize">{formatDate(appointment.date)}</p>
                        <p className="text-3xl font-black text-primary-dark mt-1">
                          {appointment.startTime}{appointment.endTime ? ` - ${appointment.endTime}` : ''}
                        </p>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="block w-full text-xl font-bold text-primary-dark border-b border-slate-200 focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => {
                              const newStart = e.target.value;
                              setEditStartTime(newStart);
                              if (newStart && !editEndTime) {
                                const [h, m] = newStart.split(':').map(Number);
                                const newH = (h + 1) % 24;
                                setEditEndTime(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                              }
                            }}
                            step="300"
                            className="text-xl font-black text-primary-dark border-b border-slate-200 focus:outline-none"
                          />
                          <span className="font-bold">-</span>
                          <input
                            type="time"
                            value={editEndTime}
                            onChange={(e) => setEditEndTime(e.target.value)}
                            step="300"
                            className="text-xl font-black text-primary-dark border-b border-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!isEditing ? (
                  location && (
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div
                        className="size-10 rounded-full flex items-center justify-center text-white shadow-sm"
                        style={{ backgroundColor: location.color }}
                      >
                        <span className="material-symbols-outlined">location_on</span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Local do Evento</p>
                        <p className="text-lg font-bold text-slate-800">{location.name}</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Local do Evento</label>
                    <select
                      value={editLocationId}
                      onChange={(e) => setEditLocationId(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-dark outline-none text-sm transition-all cursor-pointer hover:border-slate-300"
                    >
                      <option value="">Nenhum local selecionado</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Descrição</h3>
              </div>
              <div className="p-8">
                {!isEditing ? (
                  <div className="text-base leading-relaxed text-slate-600">
                    <p>{appointment.description || 'Nenhuma descrição fornecida.'}</p>
                  </div>
                ) : (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-dark outline-none text-base text-slate-600 min-h-[150px] resize-none"
                    placeholder="Adicione notas ou a pauta do compromisso..."
                  />
                )}
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Participantes</h3>
                <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">{attendees.length + 1} total</span>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-dark">Convidar Participantes</label>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{selectedUserIds.length} selecionados</span>
                      </div>

                      {/* Caixa de Busca */}
                      <div className="relative group mx-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-dark transition-colors text-[18px]">search</span>
                        <input
                          type="text"
                          placeholder="Buscar por nome ou observação..."
                          value={attendeeSearchTerm}
                          onChange={(e) => setAttendeeSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-primary-dark/5 focus:border-primary-dark transition-all outline-none text-xs shadow-sm placeholder:text-slate-300 font-medium"
                        />
                        {attendeeSearchTerm && (
                          <button
                            onClick={() => setAttendeeSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded-2xl max-h-64 overflow-y-auto p-2 bg-slate-50/50 custom-scrollbar-light shadow-inner">
                        <div className="grid grid-cols-1 gap-1">
                          {allProfiles
                            .filter(u => u.id !== appointment.created_by)
                            .filter(u =>
                              u.full_name.toLowerCase().includes(attendeeSearchTerm.toLowerCase()) ||
                              (u.observations?.toLowerCase().includes(attendeeSearchTerm.toLowerCase()))
                            )
                            .map(u => (
                              <label key={u.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${selectedUserIds.includes(u.id) ? 'bg-primary-dark/5 ring-1 ring-primary-dark/10' : 'hover:bg-white'
                                }`}>
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.includes(u.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedUserIds(prev => [...prev, u.id]);
                                    } else {
                                      setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                                    }
                                  }}
                                  className="size-4 rounded border-slate-300 text-primary-dark focus:ring-primary-dark"
                                />
                                <div className="size-8 rounded-full bg-slate-200 flex-shrink-0 border border-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 uppercase" style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : 'none', backgroundSize: 'cover' }}>
                                  {!u.avatar && (u.full_name ? u.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[13px] font-bold text-slate-700 truncate">{u.full_name}</span>
                                  {u.observations && (
                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{u.observations}</span>
                                  )}
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 italic px-1 pt-1">O organizador está incluído automaticamente.</p>
                    </div>
                  ) : (
                    <>
                      {/* 1. Organizer - High Highlight */}
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-3 px-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Organizador</p>
                          <span className="px-2 py-0.5 bg-primary-dark/10 text-primary-dark text-[9px] font-black rounded-full uppercase tracking-tighter">Responsável</span>
                        </div>
                        <div className="relative group">
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-dark to-slate-800 rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-1000 group-hover:duration-200"></div>
                          <div className="relative flex items-start gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all hover:shadow-md">
                            <div className="relative shrink-0">
                              <div
                                className="size-14 rounded-2xl bg-cover bg-center border-2 border-primary-dark shadow-inner flex items-center justify-center text-lg font-black text-primary-dark uppercase bg-slate-50"
                                style={{ backgroundImage: organizer?.avatar ? `url('${organizer.avatar}')` : 'none' }}
                              >
                                {!organizer?.avatar && (organizer?.full_name ? organizer.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                              </div>
                              <div className="absolute -bottom-2 -right-2 size-6 bg-primary-dark text-white rounded-full flex items-center justify-center border-4 border-white shadow-md">
                                <span className="material-symbols-outlined text-[12px] font-bold">verified</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                              <div>
                                <h4 className="text-base font-black text-slate-900 truncate tracking-tight mb-0.5 capitalize">{organizer?.full_name}</h4>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">{organizer?.observations || 'Sem observações'}</p>
                              </div>
                              {user?.id !== organizer?.id && (
                                <button
                                  onClick={() => organizer && onNavigateToChat?.(organizer.id)}
                                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary-dark text-white rounded-xl hover:bg-slate-900 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-primary-dark/20 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-[16px]">chat</span>
                                  Mensagem
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Organizer Management for Requests */}
                      {isOwner && attendees.some(a => a.status === 'requested') && (
                        <div className="mb-8 p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="size-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Solicitações de Participação</p>
                          </div>
                          <div className="space-y-3">
                            {attendees.filter(a => a.status === 'requested').map(attendee => {
                              const profile = allProfiles.find(p => p.id === attendee.user_id);
                              return (
                                <div key={attendee.id} className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-indigo-100 shadow-sm">
                                  <div className="flex items-center gap-4">
                                    <div className="size-11 rounded-xl bg-indigo-100 flex items-center justify-center text-sm font-black text-indigo-500 uppercase bg-cover bg-center shrink-0" style={{ backgroundImage: profile?.avatar ? `url(${profile.avatar})` : 'none' }}>
                                      {!profile?.avatar && profile?.full_name?.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate mb-0.5">{profile?.full_name}</p>
                                      <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">Solicitou participar</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 w-full">
                                    <button
                                      onClick={() => handleManageRequest(attendee.user_id, 'accepted')}
                                      className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95"
                                    >
                                      Aceitar
                                    </button>
                                    <button
                                      onClick={() => handleManageRequest(attendee.user_id, 'declined')}
                                      className="flex-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95"
                                    >
                                      Negar
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2. Attendees Groups */}
                      <div className="space-y-8">
                        {/* Accepted */}
                        {attendees.some(a => a.status === 'accepted') && (
                          <div>
                            <div className="flex items-center gap-3 mb-3 px-1">
                              <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Confirmados</p>
                            </div>
                            <div className="grid gap-3">
                              {attendees.filter(a => a.status === 'accepted').map(attendee => {
                                const profile = allProfiles.find(p => p.id === attendee.user_id);
                                const displayName = profile?.full_name || 'Usuário';
                                const avatarUrl = profile?.avatar;

                                return (
                                  <div key={attendee.id} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/30 border border-emerald-100/50 hover:bg-emerald-50/50 transition-colors">
                                    <div className="size-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-xs font-black text-emerald-700 uppercase bg-cover bg-center shadow-sm" style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none' }}>
                                      {!avatarUrl && displayName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate mb-0.5">{displayName}</p>
                                      <div className="flex items-center gap-1.5">
                                        <span className="size-1.5 rounded-full bg-emerald-500"></span>
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">Participação Confirmada</span>
                                      </div>
                                    </div>
                                    {user?.id !== attendee.user_id && (
                                      <button
                                        onClick={() => onNavigateToChat?.(attendee.user_id)}
                                        className="size-9 flex items-center justify-center bg-white text-emerald-600 border border-emerald-100 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-90"
                                        title="Enviar mensagem"
                                      >
                                        <span className="material-symbols-outlined text-[20px]">chat</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Pending */}
                        {attendees.some(a => a.status === 'pending') && (
                          <div>
                            <div className="flex items-center gap-3 mb-3 px-1">
                              <div className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                              <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em]">Aguardando Resposta</p>
                            </div>
                            <div className="grid gap-3">
                              {attendees.filter(a => a.status === 'pending').map(attendee => {
                                const profile = allProfiles.find(p => p.id === attendee.user_id);
                                const displayName = profile?.full_name || 'Usuário';
                                const avatarUrl = profile?.avatar;

                                return (
                                  <div key={attendee.id} className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50/20 border border-amber-100/50 hover:bg-amber-50/40 transition-colors">
                                    <div className="size-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xs font-black text-amber-500 uppercase bg-cover bg-center shadow-sm" style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none' }}>
                                      {!avatarUrl && displayName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-700 truncate mb-0.5">{displayName}</p>
                                      <div className="flex items-center gap-1.5">
                                        <span className="size-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter">Analisando Convite...</span>
                                      </div>
                                    </div>
                                    {user?.id !== attendee.user_id && (
                                      <button
                                        onClick={() => onNavigateToChat?.(attendee.user_id)}
                                        className="size-9 flex items-center justify-center bg-white text-amber-600 border border-amber-100 rounded-xl hover:bg-amber-500 hover:text-white transition-all shadow-sm active:scale-90"
                                        title="Enviar mensagem"
                                      >
                                        <span className="material-symbols-outlined text-[20px]">send</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Declined */}
                        {attendees.some(a => a.status === 'declined') && (
                          <div>
                            <div className="flex items-center gap-3 mb-3 px-1">
                              <div className="size-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                              <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">Recusaram</p>
                            </div>
                            <div className="grid gap-3">
                              {attendees.filter(a => a.status === 'declined').map(attendee => {
                                const profile = allProfiles.find(p => p.id === attendee.user_id);
                                const displayName = profile?.full_name || 'Usuário';
                                const avatarUrl = profile?.avatar;

                                return (
                                  <div key={attendee.id} className="flex items-center gap-3 p-3 rounded-2xl bg-rose-50/10 border border-rose-100/30 opacity-60 hover:opacity-100 transition-all">
                                    <div className="size-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-xs font-black text-rose-400 uppercase bg-cover bg-center shadow-sm" style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none' }}>
                                      {!avatarUrl && displayName.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-slate-500 truncate mb-0.5 line-through">{displayName}</p>
                                      <div className="flex items-center gap-1.5">
                                        <span className="size-1.5 rounded-full bg-rose-500"></span>
                                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-tighter">Não poderá comparecer</span>
                                      </div>
                                    </div>
                                    {user?.id !== attendee.user_id && (
                                      <button
                                        onClick={() => onNavigateToChat?.(attendee.user_id)}
                                        className="size-9 flex items-center justify-center bg-white text-rose-400 border border-rose-100 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-90"
                                        title="Enviar mensagem"
                                      >
                                        <span className="material-symbols-outlined text-[20px]">chat</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Total Count & Empty State */}
                        {attendees.length === 0 ? (
                          <div className="relative overflow-hidden group">
                            <div className="absolute inset-0 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 group-hover:bg-slate-50 group-hover:border-slate-300 transition-all"></div>
                            <div className="relative py-12 px-6 flex flex-col items-center text-center">
                              <div className="size-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-300 mb-4 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-[32px]">person_add</span>
                              </div>
                              <h5 className="text-xs font-black text-slate-500 uppercase tracking-[0.15em] mb-1">Lista Vazia</h5>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                                Nenhum colaborador <br /> convidado para este evento.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-4 border-t border-slate-100 flex justify-center">
                            <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded-full uppercase tracking-widest">
                              Total de {attendees.length + 1} participantes
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
