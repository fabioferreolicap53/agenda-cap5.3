import React, { useState, useEffect } from 'react';
import { ViewState, User, Appointment, AppointmentType, Location, Attendee } from '../types';
import { translateType, getTypeColor as getSharedTypeColor } from '../utils';
import { supabase } from '../lib/supabase';
import { DashboardNotifications } from '../components/DashboardNotifications';

interface CalendarViewProps {
  onOpenModal: (date?: string) => void;
  onChangeView: (view: ViewState) => void;
  onOpenDetails: (app: Appointment) => void;
  user: User | null;
  selectedSectorIds: string[];
  appointmentTypes: AppointmentType[];
  onNavigateToChat: (userId: string) => void;
  onToggleSidebar?: () => void;
  onDuplicate?: (appointment: Appointment) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  onOpenModal,
  onChangeView,
  onOpenDetails,
  user,
  selectedSectorIds,
  appointmentTypes,
  onNavigateToChat,
  onToggleSidebar,
  onDuplicate
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

  // History management for internal view mode
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.calendarView) {
        setViewMode(event.state.calendarView);
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Check initial state
    if (window.history.state?.calendarView) {
      setViewMode(window.history.state.calendarView);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const changeViewMode = (mode: 'month' | 'week' | 'day') => {
    window.history.pushState({ ...window.history.state, calendarView: mode }, '', '');
    setViewMode(mode);
  };
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filters
  const [locations, setLocations] = useState<Location[]>([]);
  const [filterEventType, setFilterEventType] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [filterUserRole, setFilterUserRole] = useState<'all' | 'participant' | 'organizer'>('all');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);



  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getTypeStyle = (type: string) => {
    const color = getSharedTypeColor(type, appointmentTypes);
    return `border-[${color}] text-slate-800`;
  };

  const getStyleObj = (type: string) => {
    const color = getSharedTypeColor(type, appointmentTypes);
    return {
      backgroundColor: color + '15', // 15 is ~8% opacity
      borderLeftColor: color,
      color: color
    };
  };

  const [hoverInfo, setHoverInfo] = useState<{ app: Appointment; x: number; y: number } | null>(null);

  const fetchData = async () => {
    // Fetch locations
    const { data: locData } = await supabase.from('locations').select('*').order('name');
    if (locData) setLocations(locData);

    // Fetch appointments
    let query = supabase
      .from('appointments_view')
      .select('*');

    // If no sectors are selected, show everything
    const finalSectorIds = selectedSectorIds;
    if (finalSectorIds.length > 0) {
      // Strict filtering: ONLY show events matching the selected sectors
      query = query.filter('all_participant_sector_ids', 'ov', `{${finalSectorIds.join(',')}}`);
    }

    // Fetch all users for filter
    const { data: allProfiles } = await supabase.from('profiles').select('*').order('full_name');
    if (allProfiles) setAllUsers(allProfiles as User[]);

    const { data: appData, error } = await query.order('start_time');

    if (error) {
      console.error('Error fetching appointments:', error);
      setAppointments([]);
      return;
    }

    if (appData) {
      // Fix: appointments_view might be missing location_id, fetch it explicitly
      const appIds = appData.map(d => d.id);
      const { data: rawApps } = await supabase
        .from('appointments')
        .select('id, location_id')
        .in('id', appIds);

      const locationMap = new Map();
      if (rawApps) {
        rawApps.forEach(ra => locationMap.set(ra.id, ra.location_id));
      }

      // Fetch attendees for these appointments
      const { data: attendeesData } = await supabase
        .from('appointment_attendees')
        .select('*')
        .in('appointment_id', appIds);

      const attendeesMap = new Map<string, Attendee[]>();
      if (attendeesData) {
        attendeesData.forEach((att: any) => {
          const current = attendeesMap.get(att.appointment_id) || [];
          current.push(att);
          attendeesMap.set(att.appointment_id, current);
        });
      }

      const mapped: Appointment[] = appData.map(d => ({
        id: d.id,
        title: d.title,
        date: d.date,
        startTime: d.start_time,
        endTime: d.end_time,
        type: d.type as any,
        description: d.description,
        created_by: d.created_by,
        location_id: locationMap.get(d.id) || d.location_id, // Prefer raw fetch, fallback to view
        attendees: attendeesMap.get(d.id) || []
      }));
      setAppointments(mapped);
    } else {
      setAppointments([]);
    }

    // Fetch team members with sector info (excluding current user)
    const { data: teamData } = await supabase
      .from('profiles')
      .select('*, sectors(name)')
      .neq('id', user?.id)
      .limit(5);

    if (teamData) {
      setTeam(teamData.map(d => ({
        id: d.id,
        full_name: d.full_name,
        role: d.role,
        avatar: d.avatar,
        email: '',
        observations: d.observations,
        status: d.status,
        sectorName: d.sectors?.name // Map sector name
      })));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('appointments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_attendees' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSectorIds, user?.id]);

  // Reset role filter when user filter changes
  useEffect(() => {
    setFilterUserRole('all');
  }, [filterUserId]);


  // Derived filtered list
  const filteredAppointments = appointments.filter(app => {
    const matchesType = filterEventType === 'all' || app.type === filterEventType;
    const matchesLocation = filterLocation === 'all' || app.location_id === filterLocation;

    const isOrganizer = app.created_by === filterUserId;
    const isParticipant = app.attendees?.some(a => a.user_id === filterUserId && a.status !== 'declined') ?? false;

    let matchesUser = false;
    if (filterUserId === 'all') {
      matchesUser = true;
    } else {
      if (filterUserRole === 'organizer') matchesUser = isOrganizer;
      else if (filterUserRole === 'participant') matchesUser = isParticipant;
      else matchesUser = isOrganizer || isParticipant;
    }

    return matchesType && matchesLocation && matchesUser;
  });

  // ...

  <div className="mt-10 pt-10 border-t border-slate-100">
    <h3 className="font-bold text-sm mb-6 text-primary-dark uppercase tracking-wide">Disponibilidade da Equipe</h3>
    <div className="space-y-4">
      {team.map((person) => (
        <div
          key={person.id}
          className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition-colors"
          onDoubleClick={() => onNavigateToChat(person.id)}
          title="Clique duas vezes para enviar mensagem"
        >
          <div className="relative shrink-0 mt-0.5">
            {person.avatar ? (
              <div className="size-9 rounded-full bg-cover bg-center border border-slate-100 shadow-sm" style={{ backgroundImage: `url('${person.avatar}')` }}></div>
            ) : (
              <div className="size-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-400 uppercase">
                {person.full_name ? person.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U'}
              </div>
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 size-3 border-2 border-white rounded-full ${{
              'online': 'bg-emerald-500',
              'busy': 'bg-rose-500',
              'away': 'bg-amber-500',
              'meeting': 'bg-purple-500',
              'lunch': 'bg-blue-500',
              'vacation': 'bg-indigo-500',
              'out_of_office': 'bg-slate-500'
            }[person.status || 'online']
              }`}></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-xs font-bold text-slate-800 truncate">{person.full_name}</p>
              <span className={`text-[8px] font-black uppercase tracking-wider ${{
                'online': 'text-emerald-600',
                'busy': 'text-rose-600',
                'away': 'text-amber-600',
                'meeting': 'text-purple-600',
                'lunch': 'text-blue-600',
                'vacation': 'text-indigo-600',
                'out_of_office': 'text-slate-600'
              }[person.status || 'online']
                }`}>
                {
                  {
                    'online': 'Disponível',
                    'busy': 'Ocupado',
                    'away': 'Ausente',
                    'meeting': 'Em Reunião',
                    'lunch': 'Almoço',
                    'vacation': 'Férias',
                    'out_of_office': 'Externo'
                  }[person.status || 'online']
                }
              </span>
            </div>

            {/* Sector Badge */}
            {(person as any).sectorName && (
              <div className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 mb-1">
                {(person as any).sectorName}
              </div>
            )}

            {/* Observations */}
            {person.observations && (
              <p className="text-[10px] text-slate-400 leading-snug line-clamp-2 italic">
                "{person.observations}"
              </p>
            )}
            {!person.observations && (
              <p className="text-[9px] text-slate-300 italic">Sem observações</p>
            )}
          </div>
        </div>
      ))}
      {team.length === 0 && (
        <p className="text-xs text-slate-400 italic">Nenhum membro encontrado.</p>
      )}
    </div>
  </div>

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];
    // Prev month days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: 'prev' });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month: 'current' });
    }
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: 'next' });
    }
    return days;
  };

  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());

    const days = [];
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push({
        day: d.getDate(),
        name: dayNames[i],
        isToday: d.toDateString() === new Date().toDateString(),
        fullDate: d
      });
    }
    return days;
  };

  const monthDays = getMonthDays(currentDate);
  const weekDays = getWeekDays(currentDate);

  const getTodayApps = () => {
    const today = new Date();
    return filteredAppointments.filter(app => {
      const appDate = new Date(app.date + 'T12:00:00');
      return appDate.toDateString() === today.toDateString();
    });
  };

  const todayApps = getTodayApps();

  const renderMonthView = () => (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-y-auto">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0 sticky top-0 z-10 shadow-sm">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200 last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-5 flex-grow divide-x divide-y divide-slate-200 min-h-[600px]">
        {monthDays.map((date, idx) => {
          const apps = date.month === 'current'
            ? filteredAppointments.filter(app => {
              const appDate = new Date(app.date + 'T12:00:00');
              return appDate.getFullYear() === currentDate.getFullYear() &&
                appDate.getMonth() === currentDate.getMonth() &&
                appDate.getDate() === date.day;
            })
            : [];
          const isToday = date.month === 'current' &&
            date.day === new Date().getDate() &&
            currentDate.getMonth() === new Date().getMonth() &&
            currentDate.getFullYear() === new Date().getFullYear();

          return (
            <div
              key={idx}
              onDoubleClick={() => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const d = new Date(year, month, date.day);
                if (date.month === 'prev') d.setMonth(month - 1);
                else if (date.month === 'next') d.setMonth(month + 1);

                // Format as YYYY-MM-DD without timezone shifts
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                onOpenModal(dateStr);
              }}
              className={`p-1 lg:p-2 relative group transition-colors min-h-[120px] flex flex-col ${date.month === 'current' ? (isToday ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200' : 'bg-white hover:bg-slate-50') : 'bg-slate-50/50 text-slate-400'}`}
            >
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const year = currentDate.getFullYear();
                    const month = currentDate.getMonth();
                    const d = new Date(year, month, date.day);
                    if (date.month === 'prev') d.setMonth(month - 1);
                    else if (date.month === 'next') d.setMonth(month + 1);
                    setCurrentDate(d);
                    setCurrentDate(d);
                    changeViewMode('day');
                  }}
                  className={`size-7 text-xs font-bold inline-flex items-center justify-center rounded-full transition-all active:scale-90 ${isToday ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                  {date.day}
                </button>
                {isToday && <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mr-1 opacity-80">Hoje</span>}
              </div>

              <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar pr-0.5 max-h-[80px] lg:max-h-[100px]">
                {apps.map(app => (
                  <div
                    key={app.id}
                    onClick={(e) => { e.stopPropagation(); onOpenDetails(app); }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverInfo({ app, x: rect.left, y: rect.bottom + 5 });
                    }}
                    onMouseLeave={() => setHoverInfo(null)}
                    style={getStyleObj(app.type)}
                    className="group/event relative px-2 py-1 border-l-2 rounded-r text-[10px] lg:text-[11px] font-bold cursor-pointer hover:opacity-90 transition-opacity truncate shadow-sm mb-1 flex items-center gap-1"
                  >
                    {appointmentTypes.find(t => t.value === app.type)?.icon && (
                      <span className="material-symbols-outlined text-[12px] shrink-0">
                        {appointmentTypes.find(t => t.value === app.type)?.icon}
                      </span>
                    )}
                    <span className="truncate">{app.startTime} - {app.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWeekView = () => (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-x-auto overflow-y-auto">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0 min-w-[800px]">
        {weekDays.map(wd => (
          <div key={wd.name} className="py-6 border-r border-slate-200 last:border-0 flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{wd.name}</span>
            <span
              onClick={() => {
                setCurrentDate(wd.fullDate);
                setViewMode('day');
              }}
              className={`text-lg font-black cursor-pointer hover:underline ${wd.isToday ? 'size-9 flex items-center justify-center bg-primary-dark text-white rounded-full shadow-lg shadow-primary-dark/20' : 'text-slate-900'}`}
            >
              {wd.day}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-slate-200 flex-grow min-w-[800px] min-h-[500px]">
        {weekDays.map(wd => {
          const apps = filteredAppointments.filter(app => {
            const appDate = new Date(app.date + 'T12:00:00');
            return appDate.toDateString() === wd.fullDate.toDateString();
          });
          return (
            <div
              key={wd.day}
              onDoubleClick={() => {
                const dateStr = `${wd.fullDate.getFullYear()}-${String(wd.fullDate.getMonth() + 1).padStart(2, '0')}-${String(wd.fullDate.getDate()).padStart(2, '0')}`;
                onOpenModal(dateStr);
              }}
              className={`p-4 space-y-3 ${wd.isToday ? 'bg-primary-dark/[0.02]' : 'bg-white'}`}
            >
              {apps.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">Sem eventos</span>
                </div>
              ) : (
                apps.map(app => (
                  <div
                    key={app.id}
                    onClick={() => onOpenDetails(app)}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoverInfo({ app, x: rect.right + 10, y: rect.top });
                    }}
                    onMouseLeave={() => setHoverInfo(null)}
                    style={getStyleObj(app.type)}
                    className="group/event relative p-3 rounded-xl border-l-4 shadow-sm cursor-pointer transition-all hover:translate-x-1 hover:shadow-md"
                  >
                    <p className="text-[10px] font-bold opacity-70 mb-1">{app.startTime}{app.endTime ? ` - ${app.endTime}` : ''}</p>
                    <div className="flex items-center gap-2 mb-1">
                      {appointmentTypes.find(t => t.value === app.type)?.icon && (
                        <span className="material-symbols-outlined text-[14px]">
                          {appointmentTypes.find(t => t.value === app.type)?.icon}
                        </span>
                      )}
                      <h4 className="text-xs font-bold leading-tight truncate">{app.title}</h4>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderDayView = () => {
    const apps = filteredAppointments.filter(app => {
      const appDate = new Date(app.date + 'T12:00:00');
      return appDate.toDateString() === currentDate.toDateString();
    });
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white overflow-y-auto">
        <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-2xl md:text-3xl font-black text-slate-900">{currentDate.getDate()}</span>
            <div>
              <p className="text-[10px] md:text-xs font-bold text-primary-dark uppercase tracking-widest">
                {currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
              </p>
              <p className="text-xs md:text-sm font-semibold text-slate-500">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-8 flex-grow">
          {apps.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <span className="material-symbols-outlined text-6xl mb-4 opacity-20">event_busy</span>
              <p className="font-bold uppercase tracking-widest text-sm text-center px-4">Nenhum compromisso agendado</p>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6">
              {apps.map(app => (
                <div
                  key={app.id}
                  onClick={() => onOpenDetails(app)}
                  style={getStyleObj(app.type)}
                  className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-slate-200 bg-white group"
                >
                  <div className="flex sm:flex-col items-center justify-between sm:justify-center w-full sm:w-24 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 sm:py-1">
                    <span className="text-sm font-black text-slate-900">{app.startTime}</span>
                    <div className="hidden sm:block h-4 w-px bg-slate-200 my-1"></div>
                    <span className="text-[10px] font-bold text-slate-400">{app.endTime}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] md:text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1.5" style={getStyleObj(app.type)}>
                        {appointmentTypes.find(t => t.value === app.type)?.icon && (
                          <span className="material-symbols-outlined text-[14px]">
                            {appointmentTypes.find(t => t.value === app.type)?.icon}
                          </span>
                        )}
                        {translateType(app.type, appointmentTypes)}
                      </span>
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-slate-900 mb-1 md:mb-2 line-clamp-2">{app.title}</h3>
                    <p className="text-xs md:text-sm text-slate-500 line-clamp-2">{app.description || 'Nenhuma descrição fornecida.'}</p>
                  </div>
                  <div className="hidden sm:flex items-center">
                    <span className="material-symbols-outlined text-slate-300 group-hover:text-primary-dark transition-colors">chevron_right</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-white">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="bg-primary-dark text-white flex flex-col shadow-xl shrink-0 z-20 relative overflow-visible transition-all duration-300">
          {/* Top Bar: Nav & Actions */}
          <div className="h-20 flex items-center justify-between px-6 md:px-10 border-b border-white/10 relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
              <span className="material-symbols-outlined text-[150px]">calendar_month</span>
            </div>

            <div className="flex items-center gap-6 relative z-10">
              <button
                onClick={onToggleSidebar}
                className="md:hidden size-12 flex items-center justify-center rounded-2xl hover:bg-white/10 active:scale-95 transition-all text-white/90 hover:text-white"
              >
                <span className="material-symbols-outlined text-[28px]">menu</span>
              </button>

              <div className="flex items-center gap-8">
                {/* Navigation Controls */}
                <div className="flex items-center bg-slate-900/40 rounded-xl p-1.5 shadow-inner border border-white/5">
                  <button
                    onClick={goToToday}
                    className="px-5 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg hover:bg-white/15 transition-all text-white/90 hover:text-white"
                  >
                    Hoje
                  </button>
                  <div className="w-px h-5 bg-white/10 mx-1"></div>
                  <button
                    onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
                      else if (viewMode === 'week') d.setDate(d.getDate() - 7);
                      else d.setDate(d.getDate() - 1);
                      setCurrentDate(d);
                    }}
                    className="size-9 flex items-center justify-center rounded-lg hover:bg-white/15 transition-all text-white/90 hover:text-white active:scale-90"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
                      else if (viewMode === 'week') d.setDate(d.getDate() + 7);
                      else d.setDate(d.getDate() + 1);
                      setCurrentDate(d);
                    }}
                    className="size-9 flex items-center justify-center rounded-lg hover:bg-white/15 transition-all text-white/90 hover:text-white active:scale-90"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>

                {/* Date Display */}
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  {viewMode === 'month'
                    ? <>
                      <span className="capitalize">{currentDate.toLocaleDateString('pt-BR', { month: 'long' })}</span>
                      <span className="text-white/40 font-bold">{currentDate.getFullYear()}</span>
                    </>
                    : viewMode === 'week'
                      ? <div className="flex flex-col leading-none">
                        <span className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">Semana de</span>
                        <span className="capitalize">{weekDays[0].fullDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</span>
                      </div>
                      : <div className="flex items-center gap-3">
                        <span className="text-4xl font-black text-sky-400">{currentDate.getDate()}</span>
                        <div className="flex flex-col leading-none">
                          <span className="text-sm font-bold uppercase text-white/90">{currentDate.toLocaleDateString('pt-BR', { month: 'long' })}</span>
                          <span className="text-xs font-bold text-white/40">{currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
                        </div>
                      </div>
                  }
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-5 relative z-10">
              {/* View Toggles */}

              <button
                onClick={() => onOpenModal()}
                className="hidden md:flex items-center gap-2 pl-4 pr-5 py-2.5 bg-white hover:bg-slate-50 text-primary-dark rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 group border border-slate-100"
              >
                <span className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform text-primary-dark">add_circle</span>
                Adicionar
              </button>
              <button
                onClick={() => onOpenModal()}
                className="md:hidden size-12 flex items-center justify-center bg-sky-500 text-white rounded-2xl shadow-lg active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[28px]">add</span>
              </button>
              <button
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                className="md:hidden size-12 flex items-center justify-center rounded-2xl bg-slate-800 text-white/80 hover:bg-slate-700 transition-all border border-white/10"
              >
                <span className="material-symbols-outlined">{mobileFiltersOpen ? 'filter_alt_off' : 'filter_alt'}</span>
              </button>
            </div>
          </div>

          {/* Bottom Bar: Filters */}
          <div className="hidden md:flex items-center gap-4 px-10 py-4 bg-slate-800/80 border-b border-white/5 backdrop-blur-md">
            {/* View Toggles Group */}
            <div className="flex items-center gap-2 text-white/50 mr-1">
              <span className="material-symbols-outlined text-[20px]">calendar_view_month</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Exibição</span>
            </div>

            <div className="flex bg-slate-900/50 p-1 rounded-lg border border-white/5 mr-4">
              <button onClick={() => changeViewMode('month')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'month' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Mês</button>
              <button onClick={() => changeViewMode('week')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'week' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Semana</button>
              <button onClick={() => changeViewMode('day')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'day' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Dia</button>
            </div>

            <div className="h-4 w-px bg-white/10 mx-2"></div>

            <div className="flex items-center gap-2 text-white/50 mr-2">
              <span className="material-symbols-outlined text-[20px]">filter_list</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Filtros</span>
            </div>

            <div className="h-4 w-px bg-white/10 mx-2"></div>

            <div className="relative group">
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="appearance-none pl-10 pr-10 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:bg-slate-900 focus:border-sky-500/50 transition-all cursor-pointer min-w-[180px] shadow-sm hover:border-white/20"
              >
                <option value="all" className="text-slate-900 bg-white">Todos os Usuários</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id} className="text-slate-900 bg-white">{u.full_name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-sky-400 pointer-events-none">person</span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-white/30 pointer-events-none group-hover:text-white/70 transition-colors">expand_more</span>
            </div>

            <div className={`relative group transition-all duration-300 ${filterUserId === 'all' ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
              <select
                value={filterUserRole}
                onChange={(e) => setFilterUserRole(e.target.value as any)}
                className="appearance-none pl-10 pr-10 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:bg-slate-900 focus:border-sky-500/50 transition-all cursor-pointer min-w-[170px] shadow-sm hover:border-white/20"
                disabled={filterUserId === 'all'}
              >
                <option value="all" className="text-slate-900 bg-white">Todos os Papéis</option>
                <option value="participant" className="text-slate-900 bg-white">Participante</option>
                <option value="organizer" className="text-slate-900 bg-white">Organizador</option>
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-sky-400 pointer-events-none">badge</span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-white/30 pointer-events-none group-hover:text-white/70 transition-colors">expand_more</span>
            </div>

            <div className="relative group">
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="appearance-none pl-10 pr-10 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:bg-slate-900 focus:border-sky-500/50 transition-all cursor-pointer min-w-[160px] shadow-sm hover:border-white/20"
              >
                <option value="all" className="text-slate-900 bg-white">Todos Tipos</option>
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.value} className="text-slate-900 bg-white">{t.label}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-sky-400 pointer-events-none">category</span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-white/30 pointer-events-none group-hover:text-white/70 transition-colors">expand_more</span>
            </div>

            <div className="relative group">
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="appearance-none pl-10 pr-10 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:bg-slate-900 focus:border-sky-500/50 transition-all cursor-pointer min-w-[160px] shadow-sm hover:border-white/20"
              >
                <option value="all" className="text-slate-900 bg-white">Todos Locais</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id} className="text-slate-900 bg-white">{l.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-sky-400 pointer-events-none">location_on</span>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-white/30 pointer-events-none group-hover:text-white/70 transition-colors">expand_more</span>
            </div>
          </div>

          {/* Mobile Filters Dropdown */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 bg-slate-800 shadow-inner ${mobileFiltersOpen ? 'max-h-[500px] border-b border-white/10' : 'max-h-0'}`}>
            <div className="p-6 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Opções de Visualização</p>
              <div className="flex bg-slate-900/50 p-1.5 rounded-xl border border-white/5">
                <button onClick={() => changeViewMode('month')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'month' ? 'bg-white text-primary-dark shadow-md' : 'text-white/60'}`}>Mês</button>
                <button onClick={() => changeViewMode('week')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'week' ? 'bg-white text-primary-dark shadow-md' : 'text-white/60'}`}>Semana</button>
                <button onClick={() => changeViewMode('day')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'day' ? 'bg-white text-primary-dark shadow-md' : 'text-white/60'}`}>Dia</button>
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 mt-4">Filtros</p>
              <div className="space-y-3">
                <div className="relative">
                  <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} className="bg-slate-900/50 border border-white/10 text-white rounded-xl py-3 pl-10 pr-4 text-xs font-bold w-full outline-none appearance-none"><option value="all" className="text-slate-900">Todos Usuários</option>{allUsers.map(u => <option key={u.id} value={u.id} className="text-slate-900">{u.full_name}</option>)}</select>
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sky-400 pointer-events-none text-[20px]">person</span>
                </div>
                <div className="relative">
                  <select value={filterUserRole} onChange={(e) => setFilterUserRole(e.target.value as any)} className="bg-slate-900/50 border border-white/10 text-white rounded-xl py-3 pl-10 pr-4 text-xs font-bold w-full outline-none appearance-none disabled:opacity-50" disabled={filterUserId === 'all'}><option value="all" className="text-slate-900">Todos Papéis</option><option value="participant" className="text-slate-900">Participante</option><option value="organizer" className="text-slate-900">Organizador</option></select>
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sky-400 pointer-events-none text-[20px]">badge</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)} className="bg-slate-900/50 border border-white/10 text-white rounded-xl py-3 pl-9 pr-2 text-xs font-bold w-full outline-none appearance-none"><option value="all" className="text-slate-900">Tipos</option>{appointmentTypes.map(t => <option key={t.id} value={t.value} className="text-slate-900">{t.label}</option>)}</select>
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-400 pointer-events-none text-[18px]">category</span>
                  </div>
                  <div className="relative">
                    <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="bg-slate-900/50 border border-white/10 text-white rounded-xl py-3 pl-9 pr-2 text-xs font-bold w-full outline-none appearance-none"><option value="all" className="text-slate-900">Locais</option>{locations.map(l => <option key={l.id} value={l.id} className="text-slate-900">{l.name}</option>)}</select>
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-400 pointer-events-none text-[18px]">location_on</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <DashboardNotifications user={user} onViewAppointment={onOpenDetails} />
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </div>

      {/* Right Sidebar */}
      <aside className="w-80 border-l border-slate-200 p-6 hidden xl:flex flex-col h-full bg-white overflow-y-auto shrink-0 z-10 shadow-lg">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-bold text-sm text-primary-dark uppercase tracking-wide">Próximos Hoje</h3>
          <span className="px-2 py-1 bg-primary-dark/10 text-primary-dark text-[10px] font-bold rounded uppercase">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
          </span>
        </div>

        <div className="space-y-4">
          {todayApps.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-4">Nenhum compromisso para hoje.</p>
          ) : (
            todayApps.map(app => (
              <div
                key={app.id}
                onClick={() => onOpenDetails(app)}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{app.startTime} - {app.endTime}</span>
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: appointmentTypes.find(t => t.value === app.type)?.color || '#cbd5e1' }}
                  ></div>
                </div>
                <h4 className="font-bold text-sm mb-1 text-slate-900 group-hover:text-primary-dark transition-colors">{app.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{app.description || 'Sem descrição.'}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-10 pt-10 border-t border-slate-100">
          <h3 className="font-bold text-sm mb-6 text-primary-dark uppercase tracking-wide">Disponibilidade da Equipe</h3>
          <div className="space-y-4">
            {team.map((person) => (
              <div
                key={person.id}
                className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition-colors"
                onDoubleClick={() => onNavigateToChat(person.id)}
                title="Clique duas vezes para enviar mensagem"
              >
                <div className="relative shrink-0 mt-0.5">
                  {person.avatar ? (
                    <div className="size-9 rounded-full bg-cover bg-center border border-slate-100 shadow-sm" style={{ backgroundImage: `url('${person.avatar}')` }}></div>
                  ) : (
                    <div className="size-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-400 uppercase">
                      {person.full_name ? person.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U'}
                    </div>
                  )}
                  <div className={`absolute -bottom-0.5 -right-0.5 size-3 border-2 border-white rounded-full ${{
                    'online': 'bg-emerald-500',
                    'busy': 'bg-rose-500',
                    'away': 'bg-amber-500',
                    'meeting': 'bg-purple-500',
                    'lunch': 'bg-blue-500',
                    'vacation': 'bg-indigo-500',
                    'out_of_office': 'bg-slate-500'
                  }[person.status || 'online']
                    }`}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-xs font-bold text-slate-800 truncate">{person.full_name}</p>
                    <span className={`text-[8px] font-black uppercase tracking-wider ${{
                      'online': 'text-emerald-600',
                      'busy': 'text-rose-600',
                      'away': 'text-amber-600',
                      'meeting': 'text-purple-600',
                      'lunch': 'text-blue-600',
                      'vacation': 'text-indigo-600',
                      'out_of_office': 'text-slate-600'
                    }[person.status || 'online']
                      }`}>
                      {
                        {
                          'online': 'Disponível',
                          'busy': 'Ocupado',
                          'away': 'Ausente',
                          'meeting': 'Em Reunião',
                          'lunch': 'Almoço',
                          'vacation': 'Férias',
                          'out_of_office': 'Externo'
                        }[person.status || 'online']
                      }
                    </span>
                  </div>

                  {/* Sector Badge */}
                  {(person as any).sectorName && (
                    <div className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 mb-1">
                      {(person as any).sectorName}
                    </div>
                  )}

                  {/* Observations */}
                  {person.observations && (
                    <p className="text-[10px] text-slate-400 leading-snug line-clamp-2 italic">
                      "{person.observations}"
                    </p>
                  )}
                  {!person.observations && (
                    <p className="text-[9px] text-slate-300 italic">Sem observações</p>
                  )}
                </div>
              </div>
            ))}
            {team.length === 0 && (
              <p className="text-xs text-slate-400 italic">Nenhum membro encontrado.</p>
            )}
          </div>
        </div>

        <div className="mt-auto pt-8">
          <div className="bg-primary-dark/5 p-4 rounded-xl">
            <h4 className="text-xs font-bold text-primary-dark mb-2">Dica Profissional</h4>
            <p className="text-[11px] text-slate-600 leading-normal">Clique duas vezes em qualquer espaço vazio no calendário para criar rapidamente um novo compromisso.</p>
          </div>
        </div>
      </aside>

      {/* Global Tooltip Portal */}
      {hoverInfo && (
        <div
          className="fixed w-[280px] bg-white rounded-2xl shadow-2xl z-[9999] pointer-events-none animate-[fadeIn_0.15s_ease-out] border border-slate-200 overflow-hidden ring-4 ring-slate-900/5"
          style={{
            left: Math.min(hoverInfo.x, window.innerWidth - 300),
            top: Math.min(hoverInfo.y, window.innerHeight - 320) // Adjusted safety margin
          }}
        >
          {/* Status Strip */}
          <div className="h-1.5 w-full" style={{ backgroundColor: appointmentTypes.find(t => t.value === hoverInfo.app.type)?.color || '#ccc' }}></div>

          <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 leading-snug mb-0.5">{hoverInfo.app.title}</h4>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {appointmentTypes.find(t => t.value === hoverInfo.app.type)?.icon && (
                    <span className="material-symbols-outlined text-[12px]">{appointmentTypes.find(t => t.value === hoverInfo.app.type)?.icon}</span>
                  )}
                  {translateType(hoverInfo.app.type, appointmentTypes)}
                </span>
              </div>

              {/* Organizer Avatar */}
              {(() => {
                const organizer = allUsers.find(u => u.id === hoverInfo.app.created_by);
                return organizer ? (
                  <div className="size-8 rounded-full bg-cover bg-center border-2 border-white shadow-md shrink-0"
                    style={{ backgroundImage: organizer.avatar ? `url('${organizer.avatar}')` : 'none' }}
                    title={`Organizado por: ${organizer.full_name}`}
                  >
                    {!organizer.avatar && <div className="size-full flex items-center justify-center bg-slate-100 text-[10px] font-black text-slate-400 uppercase rounded-full">{organizer.full_name?.[0]}</div>}
                  </div>
                ) : null;
              })()}
            </div>

            {/* Meta Info */}
            <div className="space-y-2.5 mb-4">
              <div className="flex items-center gap-2.5 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                <span className="material-symbols-outlined text-base text-primary-dark">schedule</span>
                <div className="flex flex-col">
                  <span className="font-bold">{hoverInfo.app.startTime} - {hoverInfo.app.endTime || '...'}</span>
                  <span className="text-[10px] text-slate-400 font-medium capitalize">
                    {new Date(hoverInfo.app.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              </div>

              {(hoverInfo.app.location_id || (hoverInfo.app as any).location_text) && (
                <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600 pl-1">
                  <span className="material-symbols-outlined text-base text-primary-dark">location_on</span>
                  <p>
                    {locations.find(l => l.id === hoverInfo.app.location_id)?.name || (hoverInfo.app as any).location_text}
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {hoverInfo.app.description && (
              <div className="mb-4 text-xs text-slate-500 leading-relaxed italic border-l-2 border-slate-200 pl-3">
                "{hoverInfo.app.description.length > 80 ? hoverInfo.app.description.substring(0, 80) + '...' : hoverInfo.app.description}"
              </div>
            )}

            {/* Attendees Preview */}
            {hoverInfo.app.attendees && hoverInfo.app.attendees.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Participantes ({hoverInfo.app.attendees.length})</p>
                <div className="flex items-center -space-x-2 pl-1">
                  {hoverInfo.app.attendees.slice(0, 5).map((att, i) => {
                    const user = allUsers.find(u => u.id === att.user_id);
                    return (
                      <div key={i} className="size-6 rounded-full border-2 border-white bg-slate-200 bg-cover bg-center ring-1 ring-slate-100"
                        style={{ backgroundImage: user?.avatar ? `url('${user.avatar}')` : 'none' }}
                        title={user?.full_name || 'Usuário'}
                      >
                        {!user?.avatar && <div className="size-full flex items-center justify-center text-[8px] font-bold text-slate-400">{user?.full_name?.[0] || 'U'}</div>}
                      </div>
                    );
                  })}
                  {hoverInfo.app.attendees.length > 5 && (
                    <div className="size-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 ring-1 ring-slate-100">
                      +{hoverInfo.app.attendees.length - 5}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

