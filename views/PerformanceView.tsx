import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Appointment, Sector, AppointmentType, Location } from '../types';

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
        if (appData) setAppointments(appData as Appointment[]);

        setLoading(false);
    };

    // --- Filtering Logic ---

    // 1. Filter Profiles (affected by Sector filter)
    const filteredProfiles = profiles.filter(p => {
        const matchesSector = filterSector === 'all' || p.sector_id === filterSector;
        return matchesSector;
    });

    // 2. Filter Appointments (affected by Type and Location filters)
    // Note: Appointments don't directly have sector_id usually, unless we join or infer from creator.
    // For this view, we'll assume Sector filter affects Profiles/Team Stats primarily, 
    // and Type/Location filters affect Appointment Stats.
    // However, if we want to filter appointments by sector, we'd need to check the creator's sector or participants.
    // Simplification for now: Sector filter affects Member stats only. Type/Location affects Appointment stats.
    const filteredAppointments = appointments.filter(a => {
        const matchesType = filterType === 'all' || a.type === filterType;
        const matchesLocation = filterLocation === 'all' || a.location_id === filterLocation;
        return matchesType && matchesLocation;
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
            </div>
        </div>
    );
};
