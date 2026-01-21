import React, { useState, useEffect } from 'react';
import { ViewState, User, Appointment, AppointmentType, Attendee, Location } from '../types';
import { translateType, getTypeColor as getSharedTypeColor } from '../utils';
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
  const [isExternalLocation, setIsExternalLocation] = useState(!!appointment.location_text);
  const [editExternalLocation, setEditExternalLocation] = useState(appointment.location_text || '');
  const [editOrganizerOnly, setEditOrganizerOnly] = useState(appointment.organizer_only || false);
  const [currentOrganizerOnly, setCurrentOrganizerOnly] = useState(appointment.organizer_only || false);

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
    // Fetch latest appointment data (to ensure we have latest fields)
    const { data: currentApp } = await supabase
      .from('appointments')
      .select('location_id, location_text, organizer_only')
      .eq('id', appointment.id)
      .single();

    if (currentApp) {
      setCurrentOrganizerOnly(currentApp.organizer_only || false);
    }

    const locationId = currentApp?.location_id || appointment.location_id;
    const locationText = currentApp?.location_text || appointment.location_text;

    // Fetch Location if exists
    if (locationId) {
      setEditLocationId(locationId); // Sync edit state
      setIsExternalLocation(false);
      const { data: locData } = await supabase
        .from('locations')
        .select('name, color')
        .eq('id', locationId)
        .single();

      if (locData) setLocation(locData);
    } else if (locationText) {
      setEditLocationId('');
      setIsExternalLocation(true);
      setEditExternalLocation(locationText);
      setLocation({ name: locationText, color: '#64748b' });
    } else {
      setEditLocationId(''); // Sync edit state
      setIsExternalLocation(false);
      setEditExternalLocation('');
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

          location_id: isExternalLocation ? null : (editLocationId || null),
          location_text: isExternalLocation ? editExternalLocation : null,
          organizer_only: editOrganizerOnly
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
    return translateType(type, appointmentTypes);
  };

  const getTypeColor = (type: string) => {
    return getSharedTypeColor(type, appointmentTypes);
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
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm font-bold"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Voltar
          </button>

          {canEdit && (
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => onDuplicate && onDuplicate(appointment)}
                    className="size-9 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-primary-dark transition-all shadow-sm"
                    title="Duplicar"
                  >
                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg hover:bg-slate-50 hover:text-primary-dark transition-all shadow-sm text-xs uppercase tracking-wide"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={handleDelete}
                    className="size-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50 rounded-lg transition-all shadow-sm"
                    title="Excluir"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg transition-all shadow-sm text-xs uppercase tracking-wide"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Salvar
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold px-4 py-2 rounded-lg transition-all shadow-sm text-xs uppercase tracking-wide"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
              {/* Decorative background info */}
              <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[120px] text-slate-900">event</span>
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border"
                    style={{ backgroundColor: getTypeColor(appointment.type) + '10', color: getTypeColor(appointment.type), borderColor: getTypeColor(appointment.type) + '20' }}
                  >
                    {getTypeLabel(appointment.type)}
                  </span>
                  {(isOwner || myAttendeeRecord) && (
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${isOwner ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                      myAttendeeRecord?.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        myAttendeeRecord?.status === 'declined' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                      <span className={`size-1.5 rounded-full ${isOwner ? 'bg-indigo-500' : myAttendeeRecord?.status === 'accepted' ? 'bg-emerald-500' : myAttendeeRecord?.status === 'declined' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                      {isOwner ? 'Você é o Organizador' : (myAttendeeRecord?.status === 'accepted' ? 'Confirmado' : (myAttendeeRecord?.status === 'declined' ? 'Recusado' : 'Pendente'))}
                    </span>
                  )}
                </div>

                {!isEditing ? (
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight mb-4">{appointment.title}</h1>
                ) : (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-2xl md:text-3xl font-black text-slate-900 leading-tight mb-4 border-b-2 border-slate-200 focus:border-primary-dark focus:outline-none bg-transparent"
                    placeholder="Título do compromisso"
                  />
                )}

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">calendar_today</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Data</span>
                      {!isEditing ? (
                        <span className="text-sm font-bold capitalize">{formatDate(appointment.date)}</span>
                      ) : (
                        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="font-bold border-b border-slate-200 focus:outline-none text-sm" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">schedule</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Horário</span>
                      {!isEditing ? (
                        <span className="text-sm font-bold">{appointment.startTime} - {appointment.endTime || '??:??'}</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="font-bold border-b border-slate-200 focus:outline-none text-sm w-16" />
                          <span>-</span>
                          <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="font-bold border-b border-slate-200 focus:outline-none text-sm w-16" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">location_on</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Local</span>
                      {!isEditing ? (
                        <span className="text-sm font-bold">{location?.name || appointment.location_text || 'Não definido'}</span>
                      ) : (
                        // Simplified Edit Logic for Layout Demo (Full logic remains in state)
                        <span className="text-xs italic text-slate-400">Editando...</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specific Edit Fields for Type/Location if Editing */}
                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Tipo</label>
                      <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full p-2 border border-slate-200 rounded text-sm font-bold text-slate-700 outline-none">
                        {appointmentTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Local</label>
                        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={isExternalLocation} onChange={e => setIsExternalLocation(e.target.checked)} className="size-3 accent-primary-dark" /><span className="text-[9px] font-bold text-slate-400 uppercase">Externo</span></label>
                      </div>
                      {!isExternalLocation ? (
                        <select value={editLocationId} onChange={e => setEditLocationId(e.target.value)} className="w-full p-2 border border-slate-200 rounded text-sm font-bold text-slate-700 outline-none">
                          <option value="">Selecione...</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      ) : (
                        <input value={editExternalLocation} onChange={e => setEditExternalLocation(e.target.value)} className="w-full p-2 border border-slate-200 rounded text-sm font-bold text-slate-700 outline-none" placeholder="Digite o local..." />
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Description Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">notes</span>
                Detalhes & Pauta
              </h3>
              {!isEditing ? (
                <div className="prose prose-sm prose-slate max-w-none text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {appointment.description ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{appointment.description}</p>
                  ) : (
                    <p className="text-slate-400 italic">Nenhuma descrição fornecida para este compromisso.</p>
                  )}
                </div>
              ) : (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-dark outline-none text-sm text-slate-600 min-h-[120px]"
                  placeholder="Adicione informações..."
                />
              )}
            </div>

            {/* Status Banners (Requests, Invites) */}
            {!isOwner && currentOrganizerOnly && !myAttendeeRecord && (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                <span className="material-symbols-outlined text-slate-400">lock</span>
                <div>
                  <p className="text-sm font-bold text-slate-700">Evento Restrito</p>
                  <p className="text-xs">Apenas o organizador e convidados podem visualizar e participar deste evento.</p>
                </div>
              </div>
            )}

            {!isOwner && !currentOrganizerOnly && !myAttendeeRecord && (
              <div className="flex items-center justify-between gap-4 p-4 bg-primary-dark/5 rounded-xl border border-primary-dark/10">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-dark">waving_hand</span>
                  <div>
                    <p className="text-sm font-bold text-primary-dark">Deseja participar?</p>
                    <p className="text-xs text-slate-500">Solicite inclusão ao organizador.</p>
                  </div>
                </div>
                <button onClick={handleRequestParticipation} disabled={loading} className="px-4 py-2 bg-primary-dark text-white text-xs font-bold rounded-lg hover:bg-primary-light transition-colors shadow-sm uppercase tracking-wide">
                  Solicitar
                </button>
              </div>
            )}

            {!isOwner && myAttendeeRecord?.status === 'pending' && (
              <div className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-lg ring-1 ring-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><span className="material-symbols-outlined">mail</span></div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Você foi convidado</p>
                    <p className="text-xs text-slate-500">Confirme sua presença neste evento.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleResponse('accepted')} disabled={loading} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all shadow-sm">Aceitar</button>
                  <button onClick={() => handleResponse('declined')} disabled={loading} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-all shadow-sm">Recusar</button>
                </div>
              </div>
            )}

            {!isOwner && myAttendeeRecord?.status === 'requested' && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800">
                <span className="material-symbols-outlined">hourglass_top</span>
                <p className="text-xs font-bold">Sua solicitação está pendente de aprovação.</p>
              </div>
            )}

          </div>

          <div className="space-y-6">

            {/* Organizer Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                Organizador
                {isOwner && <span className="bg-primary-dark/10 text-primary-dark px-2 py-0.5 rounded text-[9px]">VOCÊ</span>}
              </h3>

              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className="size-14 rounded-full bg-slate-100 border-2 border-white shadow-md bg-cover bg-center flex items-center justify-center text-xs font-black text-slate-400 uppercase"
                    style={{ backgroundImage: organizer?.avatar ? `url('${organizer.avatar}')` : 'none' }}>
                    {!organizer?.avatar && (organizer?.full_name ? organizer.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                  </div>
                  <div className="absolute -bottom-0 -right-0 size-5 bg-white rounded-full flex items-center justify-center shadow-sm ring-2 ring-white">
                    <span className="material-symbols-outlined text-[14px] text-primary-dark">verified</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{organizer?.full_name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{organizer?.observations || 'Membro'}</p>
                </div>
              </div>

              {user?.id !== organizer?.id && (
                <button
                  onClick={() => organizer && onNavigateToChat?.(organizer.id)}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide border border-slate-100"
                >
                  <span className="material-symbols-outlined text-[16px]">chat</span>
                  Enviar Mensagem
                </button>
              )}
            </div>

            {/* Participants Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Participantes</h3>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold">{attendees.length}</span>
              </div>

              {/* Requests Section (if any and is owner) */}
              {isOwner && attendees.some(a => a.status === 'requested') && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-3 shrink-0">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-indigo-500"></span> Solicitações ({attendees.filter(a => a.status === 'requested').length})
                  </p>
                  <div className="space-y-2">
                    {attendees.filter(a => a.status === 'requested').map(att => {
                      const p = allProfiles.find(u => u.id === att.user_id);
                      return (
                        <div key={att.id} className="bg-white p-2 rounded-lg border border-indigo-100 shadow-sm flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="size-6 rounded-full bg-indigo-100 bg-cover bg-center shrink-0" style={{ backgroundImage: p?.avatar ? `url(${p.avatar})` : 'none' }}></div>
                            <span className="text-xs font-bold text-slate-700 truncate">{p?.full_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleManageRequest(att.user_id, 'accepted')} className="size-6 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center hover:bg-emerald-200"><span className="material-symbols-outlined text-[14px]">check</span></button>
                            <button onClick={() => handleManageRequest(att.user_id, 'declined')} className="size-6 bg-rose-100 text-rose-600 rounded flex items-center justify-center hover:bg-rose-200"><span className="material-symbols-outlined text-[14px]">close</span></button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-1 flex-1">
                {attendees.filter(a => a.status !== 'requested').length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">Nenhum participante convidado.</p>
                ) : (
                  attendees.filter(a => a.status !== 'requested').map(att => {
                    const p = allProfiles.find(u => u.id === att.user_id);
                    const statusColor = att.status === 'accepted' ? 'text-emerald-600' : att.status === 'declined' ? 'text-rose-600' : 'text-amber-600';
                    const statusIcon = att.status === 'accepted' ? 'check_circle' : att.status === 'declined' ? 'cancel' : 'schedule';
                    const statusBg = att.status === 'accepted' ? 'bg-emerald-50 border-emerald-100' : att.status === 'declined' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100';
                    const statusText = att.status === 'accepted' ? 'Aceito' : att.status === 'declined' ? 'Recusado' : 'Aguardando';

                    return (
                      <div key={att.id} className="flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-xl transition-all group border border-transparent hover:border-slate-100 hover:shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-10 rounded-full bg-slate-100 border-2 border-white shadow-sm bg-cover bg-center shrink-0 flex items-center justify-center text-xs font-black text-slate-400 uppercase" style={{ backgroundImage: p?.avatar ? `url(${p.avatar})` : 'none' }}>
                            {!p?.avatar && (p?.full_name ? p.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{p?.full_name}</p>
                            <p className="text-[10px] text-slate-400 truncate italic">{p?.observations || 'Sem observações'}</p>
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded-lg border flex items-center gap-1.5 ${statusBg} ${statusColor}`} title={statusText}>
                          <span className="material-symbols-outlined text-[14px]">{statusIcon}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider">{statusText}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {isEditing && !editOrganizerOnly && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Adicionar Participantes</p>

                  <div className="relative group mb-2">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                    <input
                      value={attendeeSearchTerm}
                      onChange={e => setAttendeeSearchTerm(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-dark/10"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg bg-white">
                    {allProfiles.filter(u => u.id !== appointment.created_by && (u.full_name.toLowerCase().includes(attendeeSearchTerm.toLowerCase()))).map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedUserIds(prev => [...prev, u.id]);
                            else setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                          }}
                          className="size-3.5 accent-primary-dark"
                        />
                        <span className="text-xs text-slate-600 truncate flex-1">{u.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div >
      </main >
      <Footer />
    </div >
  );
};
