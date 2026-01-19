import { User, Appointment } from './types';

export const CURRENT_USER: User = {
  id: 'u1',
  full_name: 'Alex Rivera',
  role: 'Administrador',
  email: 'admin@cap53.com.br',
  avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
};

export const TEAM_MEMBERS: User[] = [
  {
    id: '1',
    full_name: 'Ana Silva',
    role: 'Normal',
    email: 'ana@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
    status: 'online',
    statusText: 'Disponível hoje',
    observations: 'Gerente de TI',
  },
  {
    id: '2',
    full_name: 'Carlos Souza',
    role: 'Normal',
    email: 'carlos@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    status: 'offline',
    statusText: 'Volta amanhã',
    observations: 'Desenvolvedor Backend',
  },
  {
    id: '3',
    full_name: 'Mariana Oliveira',
    role: 'Normal',
    email: 'mariana@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026703d',
    status: 'busy',
    statusText: 'Em reunião até 15:00',
    observations: 'Designer UI/UX',
  },
  {
    id: '4',
    full_name: 'João Pereira',
    role: 'Normal',
    email: 'joao@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026025d',
    status: 'online',
    statusText: 'Disponível agora',
    observations: 'Analista de QA',
  },
  {
    id: '5',
    full_name: 'Beatriz Costa',
    role: 'Normal',
    email: 'beatriz@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026705d',
    status: 'online',
    statusText: 'Screening candidatos',
    observations: 'Recrutadora (RH)',
  },
  {
    id: '6',
    full_name: 'Ricardo Santos',
    role: 'Normal',
    email: 'ricardo@cap53.com',
    avatar: 'https://i.pravatar.cc/150?u=2',
    status: 'busy',
    statusText: 'Disponível às 16:30',
    observations: 'Executivo de Vendas',
  },
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  { id: '1', title: 'Sincronização Semanal', date: '2023-10-03', startTime: '09:00', endTime: '10:00', type: 'sync', created_by: 'u1' },
  { id: '2', title: 'Crítica de Design', date: '2023-10-04', startTime: '14:30', endTime: '15:30', type: 'design', created_by: 'u1' },
  { id: '3', title: 'Briefing com Cliente', date: '2023-10-10', startTime: '11:00', endTime: '12:00', type: 'client', created_by: 'u1' },
  { id: '4', title: 'Kickoff do Projeto', date: '2023-10-11', startTime: '13:00', endTime: '14:30', type: 'planning', created_by: 'u1' },
  { id: '5', title: 'Revisão de QA', date: '2023-10-13', startTime: '15:30', endTime: '16:30', type: 'qa', created_by: 'u1' },
  { id: '6', title: 'Daily Standup', date: '2023-10-16', startTime: '09:00', endTime: '09:15', type: 'sync', created_by: 'u1' },
  { id: '7', title: 'Sincronização Técnica', date: '2023-10-18', startTime: '10:30', endTime: '11:30', type: 'sync', created_by: 'u1' },
  { id: '8', title: 'Revisão de Stakeholders', date: '2023-10-24', startTime: '14:00', endTime: '15:00', type: 'stakeholder', created_by: 'u1' },
  { id: '9', title: 'Planejamento de Sprint', date: '2023-10-26', startTime: '13:00', endTime: '14:30', type: 'planning', created_by: 'u1' },
];

export const STATUS_OPTIONS = [
  { id: 'online', label: 'Disponível', icon: 'fiber_manual_record', color: 'text-emerald-500', bgColor: 'bg-emerald-500' },
  { id: 'busy', label: 'Ocupado', icon: 'do_not_disturb_on', color: 'text-rose-500', bgColor: 'bg-rose-500' },
  { id: 'away', label: 'Ausente', icon: 'schedule', color: 'text-amber-500', bgColor: 'bg-amber-500' },
  { id: 'meeting', label: 'Em Reunião', icon: 'groups', color: 'text-purple-500', bgColor: 'bg-purple-500' },
  { id: 'lunch', label: 'Almoço', icon: 'restaurant', color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { id: 'vacation', label: 'Férias', icon: 'beach_access', color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  { id: 'out_of_office', label: 'Em atividade externa', icon: 'home_work', color: 'text-slate-500', bgColor: 'bg-slate-500' },
];
