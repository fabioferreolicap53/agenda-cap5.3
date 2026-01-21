import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Appointment, Sector, AppointmentType, Location, Attendee } from '../types';

interface PerformanceViewProps {
    onToggleSidebar?: () => void;
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ onToggleSidebar }) => {
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<User[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);

    // Metadata for filters
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);

    // Filters
    const [filterSector, setFilterSector] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [filterLocation, setFilterLocation] = useState('all');
    const [filterUserId, setFilterUserId] = useState<string>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Derived stats
    const [statusStats, setStatusStats] = useState<Record<string, number>>({});
    const [typeStats, setTypeStats] = useState<Record<string, number>>({});
    const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]); // Sun-Sat

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);

        // Fetch Metadata
        const { data: sectorData } = await supabase.from('sectors').select('*').order('name');
        if (sectorData) setSectors(sectorData);

        const { data: typeData } = await supabase.from('appointment_types').select('*').order('label');
        if (typeData) setAppointmentTypes(typeData);

        const { data: locData } = await supabase.from('locations').select('*').order('name');
        if (locData) setLocations(locData);

        // Fetch Profiles
        const { data: profileData } = await supabase.from('profiles').select('*');
        if (profileData) setProfiles(profileData as User[]);

        // Fetch Appointments (Last 30 days roughly for charts - or all for now)
        const { data: appData } = await supabase.from('appointments').select('*');

        if (appData) {
            const appIds = appData.map(d => d.id);

            // Fetch attendees
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
                ...d,
                attendees: attendeesMap.get(d.id) || []
            }));

            setAppointments(mapped);
        }

        setLoading(false);
    };

    // --- Filtering Logic ---

    // 1. Filter Profiles (affected by Sector filter)
    // 1. Filter Profiles (affected by Sector filter and User filter)
    const filteredProfiles = profiles.filter(p => {
        const matchesSector = filterSector === 'all' || p.sector_id === filterSector;
        const matchesUser = filterUserId === 'all' || p.id === filterUserId;
        return matchesSector && matchesUser;
    });

    // 2. Filter Appointments (affected by Type, Location, and User filters)
    // Note: Appointments don't directly have sector_id usually, unless we join or infer from creator.
    // For this view, we'll assume Sector filter affects Profiles/Team Stats primarily, 
    // and Type/Location filters affect Appointment Stats.
    // However, if we want to filter appointments by sector, we'd need to check the creator's sector or participants.
    // Simplification for now: Sector filter affects Member stats only. Type/Location affects Appointment stats.
    const filteredAppointments = appointments.filter(a => {
        const matchesType = filterType === 'all' || a.type === filterType;
        const matchesLocation = filterLocation === 'all' || a.location_id === filterLocation;
        const matchesUser = filterUserId === 'all' ||
            a.created_by === filterUserId ||
            (a.attendees?.some(att => att.user_id === filterUserId && att.status !== 'declined') ?? false);

        const matchesStartDate = !startDate || a.date >= startDate;
        const matchesEndDate = !endDate || a.date <= endDate;

        return matchesType && matchesLocation && matchesUser && matchesStartDate && matchesEndDate;
    });

    // --- Recalculate Stats based on Filtered Data ---
    const totalMembers = filteredProfiles.length;
    const totalAppointments = filteredAppointments.length;

    // Status Distribution (based on filtered profiles)
    const currentStatusStats: Record<string, number> = {};
    filteredProfiles.forEach(p => {
        const s = p.status || 'online';
        currentStatusStats[s] = (currentStatusStats[s] || 0) + 1;
    });

    // Type Stats (based on filtered appointments)
    const currentTypeStats: Record<string, number> = {};
    filteredAppointments.forEach(a => {
        const t = a.type || 'outros';
        currentTypeStats[t] = (currentTypeStats[t] || 0) + 1;
    });

    // Weekly Activity (based on filtered appointments)
    const currentWeeklyActivity = [0, 0, 0, 0, 0, 0, 0];
    filteredAppointments.forEach(a => {
        const dateParts = a.date.split('-');
        const d = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
        currentWeeklyActivity[d.getDay()]++;
    });

    const statusColors: Record<string, string> = {
        'online': 'text-emerald-500 bg-emerald-500',
        'busy': 'text-rose-500 bg-rose-500',
        'away': 'text-amber-500 bg-amber-500',
        'meeting': 'text-purple-500 bg-purple-500',
        'lunch': 'text-blue-500 bg-blue-500',
        'vacation': 'text-indigo-500 bg-indigo-500',
        'out_of_office': 'text-slate-500 bg-slate-500'
    };

    const statusLabels: Record<string, string> = {
        'online': 'Disponível',
        'busy': 'Ocupado',
        'away': 'Ausente',
        'meeting': 'Em Reunião',
        'lunch': 'Almoço',
        'vacation': 'Férias',
        'out_of_office': 'Atividade Externa'
    };

    if (loading) return <div className="p-8 text-slate-400">Carregando estatísticas...</div>;

    return (
        <div className="flex-1 p-8 bg-slate-50 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onToggleSidebar}
                            className="md:hidden size-10 flex items-center justify-center rounded-xl bg-primary-dark text-white shadow-lg active:scale-90 transition-all shrink-0"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 mb-2">Desempenho da Equipe</h1>
                            <p className="text-slate-500">Visão geral em tempo real da equipe e atividades.</p>
                        </div>
                    </div>

                    {/* Filters Bar */}
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-center">
                        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Participante</label>
                            <select
                                value={filterUserId}
                                onChange={(e) => setFilterUserId(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark"
                            >
                                <option value="all">Todos os Participantes</option>
                                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor (Equipe)</label>
                            <select
                                value={filterSector}
                                onChange={(e) => setFilterSector(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark"
                            >
                                <option value="all">Todos os Setores</option>
                                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Evento</label>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark"
                            >
                                <option value="all">Todos os Tipos</option>
                                {appointmentTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Local</label>
                            <select
                                value={filterLocation}
                                onChange={(e) => setFilterLocation(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark"
                            >
                                <option value="all">Todos os Locais</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Início</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark cursor-pointer"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fim</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-primary-dark cursor-pointer"
                            />
                        </div>
                        {(startDate || endDate) && (
                            <div className="flex items-end">
                                <button
                                    onClick={() => { setStartDate(''); setEndDate(''); }}
                                    className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                                    title="Limpar Datas"
                                >
                                    <span className="material-symbols-outlined text-[18px]">backspace</span>
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Top Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-hover hover:shadow-md">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total de Membros</p>
                        <div className="flex items-end gap-3">
                            <span className="text-3xl font-black text-slate-900">{totalMembers}</span>
                            <span className="text-xs font-bold text-emerald-500">Filtrados</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-hover hover:shadow-md">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total de Compromissos</p>
                        <div className="flex items-end gap-3">
                            <span className="text-3xl font-black text-slate-900">{totalAppointments}</span>
                            <span className="text-xs font-bold text-blue-500">Filtrados</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-hover hover:shadow-md">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Membros Disponíveis</p>
                        <div className="flex items-end gap-3">
                            <span className="text-3xl font-black text-slate-900">{currentStatusStats['online'] || 0}</span>
                            <span className="text-xs font-bold text-emerald-500">Agora</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Status Distribution Chart */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Distribuição de Status (Atual)</h3>
                        <div className="space-y-4">
                            {Object.entries(currentStatusStats).map(([status, count]) => {
                                const percentage = totalMembers > 0 ? Math.round((count / totalMembers) * 100) : 0;
                                return (
                                    <div key={status} className="group">
                                        <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                            <span>{statusLabels[status] || status}</span>
                                            <span>{count} ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${statusColors[status]?.split(' ')[1] || 'bg-slate-400'}`}
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {Object.keys(currentStatusStats).length === 0 && <p className="text-slate-400 italic text-sm">Nenhum dado com os filtros atuais.</p>}
                        </div>
                    </div>

                    {/* Appointment Types Chart */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Tipos de Agendamento</h3>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(currentTypeStats).map(([type, count]) => {
                                const typeLabel = appointmentTypes.find(t => t.value === type)?.label || type;
                                return (
                                    <div key={type} className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 flex-1 min-w-[140px]">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{typeLabel}</p>
                                        <p className="text-2xl font-black text-slate-800">{count}</p>
                                    </div>
                                )
                            })}
                            {Object.keys(currentTypeStats).length === 0 && <p className="text-slate-400 italic text-sm">Nenhum dado com os filtros atuais.</p>}
                        </div>
                    </div>
                </div>

                {/* Weekly Activity Chart */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-8">
                    <h3 className="font-bold text-slate-900 mb-6">Atividade Semanal (Compromissos por Dia)</h3>
                    <div className="h-64 w-full bg-slate-50 rounded-xl flex items-end justify-between px-6 pb-4 pt-10 relative">
                        {/* Dynamic bars */}
                        {currentWeeklyActivity.map((count, i) => {
                            const max = Math.max(...currentWeeklyActivity, 1);
                            const heightPercentage = (count / max) * 80; // Scale to 80% max height
                            return (
                                <div key={i} className="flex-1 flex flex-col justify-end items-center group h-full">
                                    <div
                                        className="w-8 md:w-16 bg-primary-dark/80 rounded-t-lg relative transition-all duration-500 hover:bg-primary-dark hover:shadow-lg"
                                        style={{ height: `${Math.max(heightPercentage, 5)}%` }} // Min height 5% for visibility
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            {count} eventos
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between mt-4 px-6">
                        {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
                            <span key={i} className="flex-1 text-center text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">{d.slice(0, 3)}</span>
                        ))}
                    </div>
                </div>

                {/* NEW SECTION: Análise de Engajamento */}
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">Análise de Engajamento</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* 1. Global Engagement Stats */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                            <h3 className="font-bold text-slate-900 mb-6">Taxas de Aceitação e Rejeição</h3>
                            {(() => {
                                // Calculate Engagement Stats
                                let totalInvites = 0;
                                let accepted = 0;
                                let declined = 0;
                                let pending = 0;

                                filteredAppointments.forEach(app => {
                                    app.attendees?.forEach(att => {
                                        totalInvites++;
                                        if (att.status === 'accepted') accepted++;
                                        else if (att.status === 'declined') declined++;
                                        else pending++;
                                    });
                                });

                                const acceptanceRate = totalInvites > 0 ? (accepted / totalInvites) * 100 : 0;
                                const rejectionRate = totalInvites > 0 ? (declined / totalInvites) * 100 : 0;
                                const pendingRate = totalInvites > 0 ? (pending / totalInvites) * 100 : 0;

                                return (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Taxa de Aceitação</p>
                                                <p className="text-3xl font-black text-emerald-700">{acceptanceRate.toFixed(1)}%</p>
                                                <p className="text-xs font-bold text-emerald-600/60 mt-1">{accepted} convites aceitos</p>
                                            </div>
                                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Taxa de Rejeição</p>
                                                <p className="text-3xl font-black text-rose-700">{rejectionRate.toFixed(1)}%</p>
                                                <p className="text-xs font-bold text-rose-600/60 mt-1">{declined} recusados</p>
                                            </div>
                                        </div>

                                        {/* Status Distribution Bar */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-500">
                                                <span>Distribuição Total ({totalInvites} convites)</span>
                                            </div>
                                            <div className="flex w-full h-4 rounded-full overflow-hidden bg-slate-100">
                                                <div style={{ width: `${acceptanceRate}%` }} className="bg-emerald-500 h-full" title="Aceitos"></div>
                                                <div style={{ width: `${pendingRate}%` }} className="bg-amber-400 h-full" title="Pendentes"></div>
                                                <div style={{ width: `${rejectionRate}%` }} className="bg-rose-500 h-full" title="Recusados"></div>
                                            </div>
                                            <div className="flex gap-4 justify-center pt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Aceitos</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2 rounded-full bg-amber-400"></div>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Pendentes</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2 rounded-full bg-rose-500"></div>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Recusados</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* 2. Breakdown by Type and Location */}
                        <div className="space-y-6">
                            {/* By Type */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                                <h3 className="font-bold text-slate-900 mb-4 text-sm">Aceitação por Tipo de Evento</h3>
                                <div className="space-y-3">
                                    {(() => {
                                        const typeStats: Record<string, { total: number, accepted: number }> = {};

                                        filteredAppointments.forEach(app => {
                                            const type = app.type || 'outros';
                                            if (!typeStats[type]) typeStats[type] = { total: 0, accepted: 0 };

                                            app.attendees?.forEach(att => {
                                                typeStats[type].total++;
                                                if (att.status === 'accepted') typeStats[type].accepted++;
                                            });
                                        });

                                        return Object.entries(typeStats)
                                            .sort(([, a], [, b]) => b.total - a.total) // Sort by volume
                                            .slice(0, 5) // Top 5
                                            .map(([type, stats]) => {
                                                const rate = stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0;
                                                const label = appointmentTypes.find(t => t.value === type)?.label || type;

                                                return (
                                                    <div key={type}>
                                                        <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                            <span className="capitalize">{label}</span>
                                                            <span>{rate.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                            <div className="bg-primary-dark h-full rounded-full" style={{ width: `${rate}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                    })()}
                                </div>
                            </div>

                            {/* By Location */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                                <h3 className="font-bold text-slate-900 mb-4 text-sm">Aceitação por Local</h3>
                                <div className="space-y-3">
                                    {(() => {
                                        const locStats: Record<string, { total: number, accepted: number }> = {};

                                        filteredAppointments.forEach(app => {
                                            const locId = app.location_id || 'unknown';
                                            if (!locStats[locId]) locStats[locId] = { total: 0, accepted: 0 };

                                            app.attendees?.forEach(att => {
                                                locStats[locId].total++;
                                                if (att.status === 'accepted') locStats[locId].accepted++;
                                            });
                                        });

                                        return Object.entries(locStats)
                                            .filter(([id]) => id !== 'unknown')
                                            .sort(([, a], [, b]) => b.total - a.total)
                                            .slice(0, 5)
                                            .map(([locId, stats]) => {
                                                const rate = stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0;
                                                const locName = locations.find(l => l.id === locId)?.name || 'Local Removido';

                                                return (
                                                    <div key={locId}>
                                                        <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                            <span>{locName}</span>
                                                            <span>{rate.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${rate}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* NEW SECTION: Organizer Performance */}
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">Desempenho dos Organizadores</h2>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Top Organizadores</h3>
                        <div className="space-y-4">
                            {(() => {
                                const organizerStats: Record<string, { count: number, totalInvites: number, accepted: number }> = {};

                                filteredAppointments.forEach(app => {
                                    const orgId = app.created_by;
                                    if (!organizerStats[orgId]) organizerStats[orgId] = { count: 0, totalInvites: 0, accepted: 0 };
                                    organizerStats[orgId].count++;

                                    app.attendees?.forEach(att => {
                                        organizerStats[orgId].totalInvites++;
                                        if (att.status === 'accepted') organizerStats[orgId].accepted++;
                                    });
                                });

                                return Object.entries(organizerStats)
                                    .sort(([, a], [, b]) => b.count - a.count)
                                    .slice(0, 10)
                                    .map(([userId, stats], index) => {
                                        const user = profiles.find(p => p.id === userId);
                                        const acceptanceRate = stats.totalInvites > 0 ? (stats.accepted / stats.totalInvites) * 100 : 0;

                                        return (
                                            <div key={userId} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                                <div className="flex items-center justify-center size-8 rounded-full bg-primary-dark text-white font-black text-sm">
                                                    {index + 1}
                                                </div>
                                                <div className="flex items-center gap-3 flex-1">
                                                    {user?.avatar ? (
                                                        <div className="size-10 rounded-full bg-cover bg-center border-2 border-white shadow-sm" style={{ backgroundImage: `url('${user.avatar}')` }}></div>
                                                    ) : (
                                                        <div className="size-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500">
                                                            {user?.full_name?.[0] || 'U'}
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <p className="font-bold text-sm text-slate-900">{user?.full_name || 'Usuário Desconhecido'}</p>
                                                        <p className="text-xs text-slate-500">{stats.count} eventos criados</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-black text-emerald-600">{acceptanceRate.toFixed(0)}%</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Aceitação</p>
                                                </div>
                                            </div>
                                        );
                                    });
                            })()}
                        </div>
                    </div>
                </div>

                {/* NEW SECTION: Peak Hours & Monthly Trends */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Peak Hours */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Horários de Pico</h3>
                        <div className="space-y-3">
                            {(() => {
                                const hourStats: Record<number, number> = {};

                                filteredAppointments.forEach(app => {
                                    if (app.startTime) {
                                        const hour = parseInt(app.startTime.split(':')[0]);
                                        hourStats[hour] = (hourStats[hour] || 0) + 1;
                                    }
                                });

                                const maxCount = Math.max(...Object.values(hourStats), 1);

                                return Object.entries(hourStats)
                                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                    .map(([hour, count]) => {
                                        const percentage = (count / maxCount) * 100;
                                        return (
                                            <div key={hour}>
                                                <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                    <span>{hour}:00 - {hour}:59</span>
                                                    <span>{count} eventos</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                    <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    });
                            })()}
                        </div>
                    </div>

                    {/* Monthly Trends */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Tendência Mensal (Últimos 6 Meses)</h3>
                        <div className="h-48 flex items-end justify-between gap-2">
                            {(() => {
                                const monthStats: Record<string, number> = {};
                                const now = new Date();
                                const months: string[] = [];

                                // Generate last 6 months
                                for (let i = 5; i >= 0; i--) {
                                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    months.push(key);
                                    monthStats[key] = 0;
                                }

                                filteredAppointments.forEach(app => {
                                    const monthKey = app.date.substring(0, 7);
                                    if (monthStats.hasOwnProperty(monthKey)) {
                                        monthStats[monthKey]++;
                                    }
                                });

                                const maxCount = Math.max(...Object.values(monthStats), 1);

                                return months.map((month, i) => {
                                    const count = monthStats[month];
                                    const heightPercentage = (count / maxCount) * 100;
                                    const [year, monthNum] = month.split('-');
                                    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });

                                    return (
                                        <div key={month} className="flex-1 flex flex-col items-center group h-full justify-end">
                                            <div
                                                className="w-full bg-primary-dark rounded-t-lg relative transition-all hover:bg-primary-dark/80"
                                                style={{ height: `${Math.max(heightPercentage, 5)}%` }}
                                            >
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                    {count} eventos
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">{monthName}</p>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* NEW SECTION: Top Participants & Duration Analytics */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Top Participants */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Participantes Mais Ativos</h3>
                        <div className="space-y-3">
                            {(() => {
                                const participantStats: Record<string, { count: number, accepted: number, declined: number }> = {};

                                filteredAppointments.forEach(app => {
                                    app.attendees?.forEach(att => {
                                        if (!participantStats[att.user_id]) {
                                            participantStats[att.user_id] = { count: 0, accepted: 0, declined: 0 };
                                        }
                                        participantStats[att.user_id].count++;
                                        if (att.status === 'accepted') participantStats[att.user_id].accepted++;
                                        if (att.status === 'declined') participantStats[att.user_id].declined++;
                                    });
                                });

                                return Object.entries(participantStats)
                                    .sort(([, a], [, b]) => b.count - a.count)
                                    .slice(0, 8)
                                    .map(([userId, stats]) => {
                                        const user = profiles.find(p => p.id === userId);
                                        const responseRate = stats.count > 0 ? ((stats.accepted + stats.declined) / stats.count) * 100 : 0;

                                        return (
                                            <div key={userId} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                                                {user?.avatar ? (
                                                    <div className="size-8 rounded-full bg-cover bg-center border-2 border-white shadow-sm" style={{ backgroundImage: `url('${user.avatar}')` }}></div>
                                                ) : (
                                                    <div className="size-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                                        {user?.full_name?.[0] || 'U'}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-xs text-slate-900 truncate">{user?.full_name || 'Usuário'}</p>
                                                    <p className="text-[10px] text-slate-500">{stats.count} participações</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-primary-dark">{responseRate.toFixed(0)}%</p>
                                                    <p className="text-[9px] font-bold text-slate-400">Resposta</p>
                                                </div>
                                            </div>
                                        );
                                    });
                            })()}
                        </div>
                    </div>

                    {/* Duration Analytics */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                        <h3 className="font-bold text-slate-900 mb-6">Análise de Duração</h3>
                        {(() => {
                            let totalMinutes = 0;
                            let appointmentCount = 0;
                            const durationByType: Record<string, { total: number, count: number }> = {};

                            filteredAppointments.forEach(app => {
                                if (app.startTime && app.endTime) {
                                    const [startH, startM] = app.startTime.split(':').map(Number);
                                    const [endH, endM] = app.endTime.split(':').map(Number);
                                    const duration = (endH * 60 + endM) - (startH * 60 + startM);

                                    if (duration > 0) {
                                        totalMinutes += duration;
                                        appointmentCount++;

                                        const type = app.type || 'outros';
                                        if (!durationByType[type]) durationByType[type] = { total: 0, count: 0 };
                                        durationByType[type].total += duration;
                                        durationByType[type].count++;
                                    }
                                }
                            });

                            const avgMinutes = appointmentCount > 0 ? totalMinutes / appointmentCount : 0;
                            const totalHours = totalMinutes / 60;

                            return (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Duração Média</p>
                                            <p className="text-3xl font-black text-blue-700">{avgMinutes.toFixed(0)}</p>
                                            <p className="text-xs font-bold text-blue-600/60 mt-1">minutos</p>
                                        </div>
                                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                                            <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">Total Agendado</p>
                                            <p className="text-3xl font-black text-purple-700">{totalHours.toFixed(1)}</p>
                                            <p className="text-xs font-bold text-purple-600/60 mt-1">horas</p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Duração Média por Tipo</p>
                                        <div className="space-y-2">
                                            {Object.entries(durationByType)
                                                .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count))
                                                .slice(0, 5)
                                                .map(([type, stats]) => {
                                                    const avg = stats.total / stats.count;
                                                    const label = appointmentTypes.find(t => t.value === type)?.label || type;

                                                    return (
                                                        <div key={type} className="flex justify-between items-center text-xs">
                                                            <span className="font-bold text-slate-600 capitalize">{label}</span>
                                                            <span className="font-black text-slate-900">{avg.toFixed(0)} min</span>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
};
