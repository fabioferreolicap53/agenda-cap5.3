export type ViewState = 'login' | 'calendar' | 'list' | 'team' | 'details' | 'performance' | 'settings' | 'messages' | 'notifications' | 'reset_password';

export interface Sector {
  id: string;
  name: string;
  created_at?: string;
}

export interface Location {
  id: string;
  name: string;
  color: string;
  has_conflict_control?: boolean;
  created_at?: string;
}

export interface User {
  id: string;
  full_name: string;
  username?: string;
  role: 'Administrador' | 'Normal';
  email: string;
  sector_id?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'busy' | 'away' | 'meeting' | 'lunch' | 'vacation' | 'out_of_office';
  statusText?: string;
  observations?: string;
  phone?: string;
}

export interface AppointmentType {
  id: string;
  label: string;
  value: string;
  color: string;
  icon?: string;
  created_at?: string;
}

export interface Attendee {
  id: string;
  appointment_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'requested';
  full_name?: string;
  avatar?: string;
  phone?: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  description?: string;
  attendees?: Attendee[];
  created_by: string;
  location_id?: string;
}
