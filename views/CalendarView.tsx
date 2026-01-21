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

  // Derived filtered list
  const filteredAppointments = appointments.filter(app => {
    const matchesType = filterEventType === 'all' || app.type === filterEventType;
    const matchesLocation = filterLocation === 'all' || app.location_id === filterLocation;

    const matchesUser = filterUserId === 'all' ||
      app.created_by === filterUserId ||
      (app.attendees?.some(a => a.user_id === filterUserId && a.status !== 'declined') ?? false);

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
                    style={getStyleObj(app.type)}
                    className="group/event relative p-3 rounded-xl border-l-4 shadow-sm cursor-pointer transition-all hover:translate-x-1"
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

                    {/* Hover Preview Tooltip */}
                    <div className="absolute left-0 bottom-full mb-3 w-56 p-3 bg-slate-900 text-white rounded-xl shadow-2xl opacity-0 invisible group-hover/event:opacity-100 group-hover/event:visible transition-all z-50 pointer-events-none translate-y-2 group-hover/event:translate-y-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="p-1 rounded bg-white/10">
                          <span className="material-symbols-outlined text-[14px]">event</span>
                        </span>
                        <p className="text-[10px] font-bold text-sky-300">{app.startTime}{app.endTime ? ` - ${app.endTime}` : ''}</p>
                      </div>
                      <p className="text-xs font-bold mb-1.5 leading-tight">{app.title}</p>
                      {app.description && (
                        <p className="text-[10px] text-slate-300 line-clamp-3 leading-relaxed border-t border-white/10 pt-1.5 mt-1.5">{app.description}</p>
                      )}
                      <div className="absolute top-full left-6 -mt-1 border-[6px] border-transparent border-t-slate-900"></div>
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
        {/* Header */}
        <header className="bg-primary-dark text-white flex flex-col px-2 md:px-8 sticky top-0 z-10 shadow-md shrink-0 transition-all duration-300">
          <div className="h-12 md:h-16 flex items-center justify-between">
            <div className="flex items-center gap-1.5 md:gap-12 w-full md:w-auto">
              {/* Mobile Menu Toggle */}
              <button
                onClick={onToggleSidebar}
                className="md:hidden size-8 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-all shrink-0 mr-2"
              >
                <span className="material-symbols-outlined text-[20px]">menu</span>
              </button>

              <div className="flex items-center gap-2 md:gap-4 text-white/90 flex-1 md:flex-none justify-center md:justify-start min-w-0">
                <button
                  onClick={goToToday}
                  className="hidden md:block px-3 py-1.5 text-xs font-bold border border-white/20 rounded-lg hover:bg-white/10 transition-all"
                >
                  Hoje
                </button>
                {viewMode !== 'month' && (
                  <button
                    onClick={() => changeViewMode('month')}
                    className="px-2 md:px-3 py-1.5 text-[10px] md:text-xs font-bold border border-white/20 rounded-lg hover:bg-white/10 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                    <span className="hidden sm:inline">Mensal</span>
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
                      else if (viewMode === 'week') d.setDate(d.getDate() - 7);
                      else d.setDate(d.getDate() - 1);
                      setCurrentDate(d);
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <h2 className="text-sm md:text-md font-semibold min-w-[120px] md:min-w-[200px] text-center capitalize truncate">
                    {viewMode === 'month'
                      ? currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                      : viewMode === 'week'
                        ? `Semana de ${weekDays[0].fullDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
                        : currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                    }
                  </h2>
                  <button
                    onClick={() => {
                      const d = new Date(currentDate);
                      if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
                      else if (viewMode === 'week') d.setDate(d.getDate() + 7);
                      else d.setDate(d.getDate() + 1);
                      setCurrentDate(d);
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              </div>

              {/* Mobile Filter Toggle */}
              <button
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                className="md:hidden size-8 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">{mobileFiltersOpen ? 'filter_list_off' : 'filter_list'}</span>
              </button>

              {/* Filters - Desktop */}
              <div className="hidden md:flex items-center gap-2 md:gap-3">
                <select
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-1.5 text-[10px] md:text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 max-w-[140px]"
                >
                  <option value="all" className="text-slate-800">Todos</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id} className="text-slate-800">{u.full_name}</option>
                  ))}
                </select>

                <select
                  value={filterEventType}
                  onChange={(e) => setFilterEventType(e.target.value)}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-1.5 text-[10px] md:text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 max-w-[110px]"
                >
                  <option value="all" className="text-slate-800">Todos Tipos</option>
                  {appointmentTypes.map(t => (
                    <option key={t.id} value={t.value} className="text-slate-800">{t.label}</option>
                  ))}
                </select>

                <select
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-1.5 text-[10px] md:text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 max-w-[110px]"
                >
                  <option value="all" className="text-slate-800">Todos Locais</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id} className="text-slate-800">{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="hidden md:flex items-center justify-end flex-1 gap-4 ml-4">
              <div className="flex bg-white/10 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => changeViewMode('month')}
                  className={`px-3 lg:px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70 hover:text-white'}`}
                >
                  Mês
                </button>
                <button
                  onClick={() => changeViewMode('week')}
                  className={`px-3 lg:px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70 hover:text-white'}`}
                >
                  Semana
                </button>
                <button
                  onClick={() => changeViewMode('day')}
                  className={`px-3 lg:px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'day' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70 hover:text-white'}`}
                >
                  Dia
                </button>
              </div>
              <div className="h-8 w-px bg-white/20 mx-2"></div>
              <button
                onClick={() => onOpenModal()}
                className="flex items-center gap-2 px-4 lg:px-5 py-2 bg-white text-primary-dark hover:bg-slate-100 rounded-lg font-bold text-sm transition-all shadow-lg shadow-black/5 shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                <span className="hidden lg:inline">Adicionar</span>
              </button>
            </div>

            <button
              onClick={() => onOpenModal()}
              className="md:hidden size-8 flex items-center justify-center bg-white text-primary-dark rounded-lg shadow-lg ml-2 active:scale-95 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>

          {/* Mobile Filters Dropdown */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileFiltersOpen ? 'max-h-64 opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 w-full"
              >
                <option value="all" className="text-slate-800">Todos os Participantes</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id} className="text-slate-800">{u.full_name}</option>
                ))}
              </select>
              <div className="flex bg-white/10 p-1 rounded-lg col-span-2 justify-between">
                {/* View Mode Toggle Mobile */}
                <button onClick={() => changeViewMode('month')} className={`flex-1 py-1.5 text-[10px] font-bold rounded md:rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70'}`}>Mês</button>
                <button onClick={() => changeViewMode('week')} className={`flex-1 py-1.5 text-[10px] font-bold rounded md:rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70'}`}>Sem</button>
                <button onClick={() => changeViewMode('day')} className={`flex-1 py-1.5 text-[10px] font-bold rounded md:rounded-md transition-all ${viewMode === 'day' ? 'bg-white text-primary-dark shadow-sm' : 'text-white/70'}`}>Dia</button>
              </div>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 w-full"
              >
                <option value="all" className="text-slate-800">Tipos (Todos)</option>
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.value} className="text-slate-800">{t.label}</option>
                ))}
              </select>
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="bg-white/10 text-white border border-white/20 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:bg-white/20 option:bg-slate-800 w-full"
              >
                <option value="all" className="text-slate-800">Locais (Todos)</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id} className="text-slate-800">{l.name}</option>
                ))}
              </select>
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
      <aside className="w-80 border-l border-slate-200 p-6 hidden xl:flex flex-col h-full bg-white overflow-y-auto shrink-0">
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
          className="fixed w-56 p-3 bg-slate-900 text-white rounded-xl shadow-2xl z-[9999] pointer-events-none animate-[fadeIn_0.1s_ease-out]"
          style={{
            left: Math.min(hoverInfo.x, window.innerWidth - 240), // Prevent overflow right
            top: Math.min(hoverInfo.y, window.innerHeight - 150) // Prevent overflow bottom (simple check)
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1 rounded bg-white/10">
              <span className="material-symbols-outlined text-[14px]">event</span>
            </span>
            <p className="text-[10px] font-bold text-sky-300">
              {hoverInfo.app.startTime}{hoverInfo.app.endTime ? ` - ${hoverInfo.app.endTime}` : ''}
            </p>
          </div>
          <p className="text-xs font-bold mb-1.5 leading-tight">{hoverInfo.app.title}</p>
          {hoverInfo.app.description && (
            <p className="text-[10px] text-slate-300 line-clamp-3 leading-relaxed border-t border-white/10 pt-1.5 mt-1.5">
              {hoverInfo.app.description}
            </p>
          )}
          {/* Optional: Arrow (tricky to position dynamically, ommitted for simpler robust floating) */}
        </div>
      )}
    </div>
  );
};

