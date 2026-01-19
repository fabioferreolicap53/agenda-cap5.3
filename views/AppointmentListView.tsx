import React, { useState, useEffect } from 'react';
import { ViewState, User, Appointment, AppointmentType, Sector, Location } from '../types';
import { supabase } from '../lib/supabase';

interface AppointmentListViewProps {
    onChangeView: (view: ViewState) => void;
    onOpenDetails: (app: Appointment) => void;
    user: User | null;
    selectedSectorIds: string[];
    appointmentTypes: AppointmentType[];
    sectors: Sector[];
    onToggleSidebar?: () => void;
}

export const AppointmentListView: React.FC<AppointmentListViewProps> = ({
    onChangeView,
    onOpenDetails,
    user,
    selectedSectorIds,
    appointmentTypes,
    sectors,
    onToggleSidebar
}) => {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterLocation, setFilterLocation] = useState('all');
    const [localSectorId, setLocalSectorId] = useState<string>('all');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const fetchAppointments = async () => {
        setLoading(true);

        // Fetch locations
        const { data: locData } = await supabase.from('locations').select('*').order('name');
        if (locData) setLocations(locData);

        // Combine global sidebar filter with local page filter
        const finalSectorIds = localSectorId === 'all'
            ? selectedSectorIds
            : (selectedSectorIds.includes(localSectorId) ? [localSectorId] : [localSectorId, ...selectedSectorIds]);

        let query = supabase
            .from('appointments_view')
            .select('*');

        if (finalSectorIds.length > 0) {
            // Strict filtering: ONLY show events matching the selected sectors
            query = query.filter('all_participant_sector_ids', 'ov', `{${finalSectorIds.join(',')}}`);
        }

        const { data, error } = await query.order('date', { ascending: sortOrder === 'asc' });

        if (error) {
            console.error('Error fetching appointments:', error);
            setAppointments([]);
            setLoading(false);
            return;
        }

        if (data) {
            // Fix: appointments_view might be missing location_id, fetch it explicitly
            const appIds = data.map(d => d.id);
            const { data: rawApps } = await supabase
                .from('appointments')
                .select('id, location_id')
                .in('id', appIds);

            const locationMap = new Map();
            if (rawApps) {
                rawApps.forEach(ra => locationMap.set(ra.id, ra.location_id));
            }

            const mapped: Appointment[] = data.map(d => ({
                id: d.id,
                title: d.title,
                date: d.date,
                startTime: d.start_time,
                endTime: d.end_time,
                type: d.type as any,
                description: d.description,
                created_by: d.created_by,
                location_id: locationMap.get(d.id) || d.location_id
            }));
            setAppointments(mapped);
        } else {
            setAppointments([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAppointments();
        const channel = supabase.channel('appointments_list_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
                fetchAppointments();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_attendees' }, () => {
                fetchAppointments();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [sortOrder, selectedSectorIds, localSectorId, user?.id]);

    const filteredAppointments = appointments.filter(app => {
        const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (app.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
        const matchesType = filterType === 'all' || app.type === filterType;
        const matchesLocation = filterLocation === 'all' || app.location_id === filterLocation;
        return matchesSearch && matchesType && matchesLocation;
    });

    const getTypeLabel = (type: string) => {
        return appointmentTypes.find(t => t.value === type)?.label || type;
    };

    const getTypeColor = (type: string) => {
        return appointmentTypes.find(t => t.value === type)?.color || '#cbd5e1';
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <nav className="flex items-center gap-2 text-sm">
                        <a onClick={() => onChangeView('calendar')} className="text-slate-500 hover:text-primary-dark transition-colors cursor-pointer text-xs font-bold uppercase tracking-wider">Home</a>
                        <span className="text-slate-400">/</span>
                        <span className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Lista de Compromissos</span>
                    </nav>
                </div>
            </header>

            <div className="p-4 md:p-8 flex flex-col h-full overflow-hidden">
                <div className="mb-8 space-y-4 shrink-0">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={onToggleSidebar}
                                className="md:hidden size-10 flex items-center justify-center rounded-xl bg-primary-dark text-white shadow-lg active:scale-90 transition-all"
                            >
                                <span className="material-symbols-outlined">menu</span>
                            </button>
                            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Lista de Compromissos</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:border-primary-dark transition-all shadow-sm active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">
                                    {sortOrder === 'asc' ? 'south' : 'north'}
                                </span>
                                Data: {sortOrder === 'asc' ? 'Recentes' : 'Antigos'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative group md:col-span-2">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-dark transition-colors">search</span>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-primary-dark/5 focus:border-primary-dark transition-all outline-none text-sm shadow-sm"
                                placeholder="Buscar por título ou descrição..."
                                type="text"
                            />
                        </div>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">filter_list</span>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-primary-dark/5 focus:border-primary-dark transition-all outline-none text-[11px] font-bold uppercase tracking-wider appearance-none cursor-pointer"
                            >
                                <option value="all">Tipos (Todos)</option>
                                {appointmentTypes.map(t => (
                                    <option key={t.id} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">location_on</span>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-primary-dark/5 focus:border-primary-dark transition-all outline-none text-[11px] font-bold uppercase tracking-wider appearance-none cursor-pointer"
                            >
                                <option value="all">Locais (Todos)</option>
                                {locations.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                            <p className="text-sm font-medium">Carregando compromissos...</p>
                        </div>
                    ) : filteredAppointments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">event_busy</span>
                            <p className="text-sm font-medium">Nenhum compromisso encontrado.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 pb-10">
                            {filteredAppointments.map(app => {
                                const appDate = new Date(app.date + 'T12:00:00');
                                const isToday = appDate.toDateString() === new Date().toDateString();

                                return (
                                    <div
                                        key={app.id}
                                        onClick={() => onOpenDetails(app)}
                                        className={`bg-white p-6 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${isToday ? 'border-primary-dark/30 shadow-md ring-1 ring-primary-dark/10 bg-primary-dark/[0.02]' : 'border-slate-100 shadow-sm hover:shadow-md'}`}
                                    >
                                        {isToday && (
                                            <div className="absolute top-0 right-0">
                                                <div className="bg-primary-dark text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-sm">
                                                    Hoje
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={`size-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-primary-dark text-white shadow-lg shadow-primary-dark/20' : 'bg-primary-dark/5 text-primary-dark'}`}>
                                                    <span className="text-[10px] font-bold uppercase">{new Date(app.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                                                    <span className="text-xl font-black leading-none">{app.date.split('-')[2]}</span>
                                                </div>
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span
                                                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                                            style={{ backgroundColor: getTypeColor(app.type) + '20', color: getTypeColor(app.type) }}
                                                        >
                                                            {getTypeLabel(app.type)}
                                                        </span>
                                                        <span className={`text-xs font-bold ${isToday ? 'text-primary-dark' : 'text-slate-400'}`}>
                                                            {app.startTime}{app.endTime ? ` - ${app.endTime}` : ''}
                                                        </span>
                                                    </div>
                                                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-primary transition-colors">{app.title}</h3>
                                                    <p className="text-sm text-slate-500 line-clamp-1">{app.description || 'Sem descrição.'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 self-end md:self-auto">
                                                <span className={`material-symbols-outlined group-hover:text-primary transition-colors ${isToday ? 'text-primary-dark' : 'text-slate-300'}`}>chevron_right</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div >
        </div >
    );
};
