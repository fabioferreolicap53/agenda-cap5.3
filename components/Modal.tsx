import React, { useState, useEffect } from 'react';
import { User as AppUser, AppointmentType, Location, Appointment } from '../types';
import { supabase } from '../lib/supabase';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
  appointmentTypes: AppointmentType[];
  initialDate?: string;
  onSave?: (appointment: any) => void;
  refreshAppointments?: () => void;
  initialSelectedUsers?: string[];
  initialAppointment?: Appointment | null;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, user, appointmentTypes, initialDate, refreshAppointments, initialSelectedUsers, initialAppointment }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState(appointmentTypes[0]?.value || 'sync');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [isExternalLocation, setIsExternalLocation] = useState(false);
  const [externalLocation, setExternalLocation] = useState('');
  const [organizerOnly, setOrganizerOnly] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [locationConflict, setLocationConflict] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Reset state on open
    if (isOpen) {
      if (initialAppointment) {
        setTitle(initialAppointment.title);

        // Ensure date is a string in YYYY-MM-DD format
        let formattedDate = '';
        if (typeof initialAppointment.date === 'string') {
          formattedDate = initialAppointment.date.split('T')[0];
        } else if (initialAppointment.date instanceof Date) {
          formattedDate = (initialAppointment.date as Date).toISOString().split('T')[0];
        }
        setDate(formattedDate);

        setStartTime(initialAppointment.startTime);
        setEndTime(initialAppointment.endTime || '');
        setType(initialAppointment.type);
        setDescription(initialAppointment.description || '');
        if (initialAppointment.location_id) {
          setSelectedLocationId(initialAppointment.location_id);
          setIsExternalLocation(false);
          setExternalLocation('');
        } else if (initialAppointment.location_text) {
          setSelectedLocationId('');
          setIsExternalLocation(true);
          setExternalLocation(initialAppointment.location_text);
        } else {
          setSelectedLocationId('');
          setIsExternalLocation(false);
          setExternalLocation('');
        }

        setOrganizerOnly(initialAppointment.organizer_only || false);
        setSelectedUserIds(initialSelectedUsers || []);
      } else {
        setTitle('');
        setDate(initialDate ? initialDate.split('T')[0] : '');
        setStartTime('');
        setEndTime('');
        setDescription('');
        setSelectedUserIds(initialSelectedUsers || []);
        setSelectedLocationId('');
        setIsExternalLocation(false);
        setExternalLocation('');
        setOrganizerOnly(false);
      }
      setSearchTerm('');
      setLocationConflict(null);
    }
  }, [isOpen, initialDate, initialSelectedUsers, initialAppointment]);

  useEffect(() => {
    if (appointmentTypes.length > 0 && !type) {
      setType(appointmentTypes[0].value);
    }
  }, [appointmentTypes]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch Users
      const { data: userData } = await supabase.from('profiles').select('*').order('full_name');
      if (userData) {
        setUsers(userData.map(d => ({
          id: d.id,
          full_name: d.full_name,
          role: d.role,
          email: '',
          observations: d.observations,
          avatar: d.avatar,
          username: d.username
        })));
      }

      // Fetch Locations
      const { data: locationData } = await supabase.from('locations').select('*').order('name');
      if (locationData) {
        setLocations(locationData as Location[]);
      }
    };
    if (isOpen) fetchData();
  }, [isOpen]);

  const checkConflict = async (locId: string, dateStr: string, start: string, end: string) => {
    const { data, error } = await supabase
      .from('appointments')
      .select('title, start_time, end_time')
      .eq('location_id', locId)
      .eq('date', dateStr);

    if (error) {
      console.error('Error checking conflict:', error);
      return null;
    }

    if (data && data.length > 0) {
      return {
        title: data[0].title,
        start: data[0].start_time,
        end: data[0].end_time
      };
    }
    return null;
  };

  /* New state for conflict alert dialog */
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<{ title: string; start: string; end: string } | null>(null);

  const saveAppointment = async (checkConflictFirst: boolean) => {
    if (!user) return;
    setLoading(true);

    try {
      if (checkConflictFirst && selectedLocationId && !isExternalLocation && date) {
        const selectedLocation = locations.find(l => l.id === selectedLocationId);

        // If location has conflict control, times are mandatory
        if (selectedLocation?.has_conflict_control) {
          if (!startTime || !endTime) {
            alert('Horário de início e término são obrigatórios para este local.');
            setLoading(false);
            return;
          }
        }

        console.log('Checking conflict for:', { selectedLocationId, date });
        const conflict = await checkConflict(selectedLocationId, date, startTime || '', endTime || '');
        if (conflict) {
          console.log('Conflict found:', conflict);

          // Check if the times actually overlap
          const isConflict = (
            (startTime >= conflict.start && startTime < conflict.end) || // New start is during existing
            (endTime > conflict.start && endTime <= conflict.end) || // New end is during existing
            (startTime <= conflict.start && endTime >= conflict.end) // New wraps existing
          );

          if (isConflict) {
            setConflictDetails(conflict);
            setShowConflictDialog(true);
            setLoading(false);
            return;
          }
        }
        console.log('No conflict found or overlap');
      }

      const { data: newAppointment, error } = await supabase.from('appointments').insert({
        title,
        date,
        start_time: startTime,
        end_time: endTime,
        type,
        description,
        created_by: user.id,
        location_id: isExternalLocation ? null : (selectedLocationId || null),
        location_text: isExternalLocation ? externalLocation : null,
        organizer_only: organizerOnly
      }).select().single();

      if (error) throw error;

      if (selectedUserIds.length > 0 && newAppointment) {
        // Ensure unique user IDs
        const uniqueSelectedIds = Array.from(new Set(selectedUserIds));
        const attendeesToInsert = uniqueSelectedIds.map(uid => ({
          appointment_id: newAppointment.id,
          user_id: uid,
          status: 'pending'
        }));

        const { error: attendeeError } = await supabase
          .from('appointment_attendees')
          .insert(attendeesToInsert);

        if (attendeeError) throw attendeeError;
      }

      if (refreshAppointments) refreshAppointments();

      handleClose();
    } catch (err: any) {
      alert('Erro ao criar compromisso: ' + err.message);
    } finally {
      if (!showConflictDialog) setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAppointment(true);
  };

  const handleClose = () => {
    onClose();
    setShowConflictDialog(false);
    setConflictDetails(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      <div className="relative bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-[fadeIn_0.2s_ease-out] flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-primary-dark">Novo Compromisso</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-primary-dark transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Conflict Alert Overlay */}
        {/* Conflict Alert Overlay */}
        {showConflictDialog && conflictDetails && (
          <div className="absolute inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-[0_0_50px_rgba(225,29,72,0.25)] border-2 border-rose-500 p-6 flex flex-col items-center relative overflow-hidden">
              {/* Decorative background circle */}
              <div className="absolute -top-10 -right-10 size-32 bg-rose-50 rounded-full blur-2xl pointer-events-none"></div>

              <div className="size-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 animate-pulse shrink-0 relative z-10">
                <span className="material-symbols-outlined text-[32px]">warning</span>
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-2 text-center relative z-10">Conflito de Local!</h3>

              <p className="text-sm text-slate-600 text-center mb-5 relative z-10">
                Este local já possui um evento agendado neste horário. Por favor, escolha outro horário ou local.
              </p>

              <div className="w-full bg-rose-50 border border-rose-100 rounded-xl p-3 mb-6 relative z-10">
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-lg bg-rose-200/50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-rose-600 text-[18px]">event_busy</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-0.5">Evento Existente</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{conflictDetails.title}</p>
                    <p className="text-xs text-slate-500 font-medium">{conflictDetails.start} - {conflictDetails.end}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full relative z-10">
                <button
                  onClick={() => {
                    setShowConflictDialog(false);
                    setConflictDetails(null);
                  }}
                  className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition-all shadow-lg shadow-slate-900/20"
                >
                  Cancelar e Escolher Outro
                </button>
                <button
                  className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition-all shadow-lg shadow-slate-900/20"
                >
                  Entendi e Vou Alterar
                </button>
              </div>
            </div>
          </div>
        )}
        <form className="p-6 space-y-5 overflow-y-auto custom-scrollbar" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Título</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all placeholder:text-slate-400 outline-none"
              placeholder="Digite o título do compromisso..."
              type="text"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Data</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">calendar_month</span>
                <input
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none"
                  type="date"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Início</label>
                <input
                  required
                  value={startTime}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setStartTime(newStart);
                    setLocationConflict(null);

                    // Auto-set end time to +1 hour if empty or if we want to be helpful
                    if (newStart && !endTime) {
                      const [h, m] = newStart.split(':').map(Number);
                      const newH = (h + 1) % 24;
                      setEndTime(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                  }}
                  step="300" // 5 minutes
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none"
                  type="time"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Término</label>
                <input
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setLocationConflict(null);
                  }}
                  step="300" // 5 minutes
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none"
                  type="time"
                />
              </div>
            </div>
            {/* Quick Duration Chips */}
            <div className="md:col-span-2 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Duração:</span>
              {[30, 45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    if (!startTime) return;
                    const [h, m] = startTime.split(':').map(Number);
                    const totalMins = h * 60 + m + mins;
                    const newH = Math.floor(totalMins / 60) % 24;
                    const newM = totalMins % 60;
                    setEndTime(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                  }}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-xs font-bold transition-colors shrink-0"
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Tipo de Evento</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none appearance-none"
              >
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Local</label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={isExternalLocation}
                      onChange={(e) => {
                        setIsExternalLocation(e.target.checked);
                        if (e.target.checked) {
                          setSelectedLocationId('');
                          setLocationConflict(null);
                        }
                      }}
                      className="peer sr-only"
                    />
                    <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-dark/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary-dark"></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-primary-dark transition-colors uppercase tracking-wider">Local externo</span>
                </label>
              </div>

              {!isExternalLocation ? (
                <select
                  value={selectedLocationId}
                  onChange={(e) => {
                    setSelectedLocationId(e.target.value);
                    setLocationConflict(null);
                  }}
                  className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none appearance-none`}
                >
                  <option value="">Nenhum local selecionado</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={externalLocation}
                  onChange={(e) => setExternalLocation(e.target.value)}
                  placeholder="Digite o local externo..."
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all outline-none"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-primary-dark focus:border-transparent text-sm transition-all resize-none outline-none"
              placeholder="Adicione notas ou a pauta do compromisso..."
              rows={2}
            ></textarea>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-primary-dark">Convidar Participantes</label>
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={organizerOnly}
                  onChange={(e) => {
                    setOrganizerOnly(e.target.checked);
                    if (e.target.checked) {
                      setSelectedUserIds([]);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-primary-dark focus:ring-primary-dark cursor-pointer"
                />
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-primary-dark transition-colors uppercase tracking-wider">Exclusivo ao organizador</span>
              </label>
            </div>

            {!organizerOnly ? (
              <>
                <div className="mb-2 relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                  <input
                    type="text"
                    placeholder="Buscar participante..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-primary-dark focus:ring-1 focus:ring-primary-dark outline-none transition-all"
                  />
                </div>
                <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-slate-50/30 custom-scrollbar">
                  <div className="grid grid-cols-1 gap-1">
                    {users
                      .filter(u => u.id !== user?.id)
                      .filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
                      .map(u => (
                        <label key={u.id} className="flex items-center gap-3 p-1.5 rounded-md hover:bg-white cursor-pointer transition-colors">
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
                          <div className="size-6 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase" style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : 'none', backgroundSize: 'cover' }}>
                            {!u.avatar && (u.full_name ? u.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-slate-700 truncate">{u.full_name}</span>
                            {u.observations && (
                              <span className="text-[10px] text-slate-400 font-bold truncate tracking-tight">{u.observations}</span>
                            )}
                          </div>
                        </label>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 text-xs italic">
                Convites desativados para eventos exclusivos.
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 mt-2 shrink-0">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary-dark hover:bg-slate-50 transition-colors"
              type="button"
            >
              Cancelar
            </button>
            <button
              disabled={loading}
              className="px-8 py-2.5 rounded-lg bg-primary-dark hover:bg-primary-light text-white text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
              type="submit"
            >
              {loading ? 'Salvando...' : 'Criar Compromisso'}
            </button>
          </div>
        </form>
      </div >
    </div >
  );
};
