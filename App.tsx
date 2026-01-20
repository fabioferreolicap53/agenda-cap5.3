import React, { useState, useEffect } from 'react';
import { ViewState } from './types';
import { LoginView } from './views/LoginView';
import { Sidebar } from './components/Sidebar';
import { CalendarView } from './views/CalendarView';
import { TeamView } from './views/TeamView';
import { AppointmentDetailView } from './views/AppointmentDetailView';
import { PerformanceView } from './views/PerformanceView';
import { SettingsView } from './views/SettingsView';
import { AppointmentListView } from './views/AppointmentListView';
import { MessagesView } from './views/MessagesView';
import { NotificationsView } from './views/NotificationsView';
import { Modal } from './components/Modal';
import { Footer } from './components/Footer';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { User as AppUser, Appointment, Sector, AppointmentType } from './types';
import { useCallback } from 'react';
import { MobileNav } from './components/MobileNav';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('login');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [initialSelectedUsers, setInitialSelectedUsers] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [duplicateAppointment, setDuplicateAppointment] = useState<Appointment | null>(null);
  const [chatTargetUserId, setChatTargetUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingNotificationsCount, setPendingNotificationsCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [previousView, setPreviousView] = useState<ViewState | null>(null);

  const fetchData = useCallback(async (uid?: string) => {
    const userId = uid || session?.user.id;
    if (!userId) return;

    // 1. Fetch Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, sectors(name)')
      .eq('id', userId)
      .single();

    if (profile) {
      setCurrentUser({
        id: profile.id,
        full_name: profile.full_name,
        username: profile.username,
        role: profile.role,
        email: session?.user.email || '',
        sector_id: profile.sector_id,
        observations: profile.observations,
        avatar: profile.avatar,
        status: profile.status
      });
    }

    // 2. Fetch Sectors
    const { data: sectorsData } = await supabase.from('sectors').select('*').order('name');
    if (sectorsData) {
      setSectors(sectorsData);
    }

    // 3. Fetch Appointment Types
    const { data: typesData } = await supabase.from('appointment_types').select('*').order('label');
    if (typesData) {
      setAppointmentTypes(typesData);
    }

    // 4. Fetch Unread Messages Count
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('read', false);

    if (!countError && count !== null) {
      setUnreadCount(count);
    }

    // 5. Fetch Pending Notifications Count (Invitations + Requests)
    const { data: invitations } = await supabase
      .from('appointment_attendees')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending');

    const { data: requests } = await supabase
      .from('appointment_attendees')
      .select('*, appointments(created_by)')
      .eq('status', 'requested');

    const myRequestsCount = requests?.filter((r: any) => r.appointments?.created_by === userId).length || 0;

    const totalNotifications = (invitations?.length || 0) + myRequestsCount;
    setPendingNotificationsCount(totalNotifications);
  }, [session?.user.id, session?.user.email]);

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchData(session.user.id);
        setCurrentView('calendar');
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchData(session.user.id);
        setCurrentView('calendar');
      } else {
        setCurrentUser(null);
        setCurrentView('login');
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchData]);

  // Separate effect for messages subscription
  useEffect(() => {
    if (!session?.user?.id) return;

    const subscription = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE)
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${session.user.id}`
        },
        () => {
          // Re-fetch unread count and notifications on any change to user's messages
          fetchData(session.user.id);
        }
      )
      .subscribe();

    const notificationsSubscription = supabase
      .channel('public:appointment_attendees_badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointment_attendees'
        },
        () => {
          fetchData(session.user.id);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      notificationsSubscription.unsubscribe();
    };
  }, [session?.user?.id, fetchData]);


  const handleLogin = () => {
    // CurrentView will be updated by handleLogin in LoginView calling supabase.auth.signIn
    // but we can also set it here if we want immediate feedback
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleOpenDetails = (app: Appointment) => {
    setPreviousView(currentView);
    setSelectedAppointment(app);
    setCurrentView('details');
  };

  const openAppointmentById = async (id: string) => {
    const { data } = await supabase.from('appointments').select('*').eq('id', id).single();
    if (data) {
      const app: Appointment = {
        id: data.id,
        title: data.title,
        date: data.date,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type,
        description: data.description,
        created_by: data.created_by
      };
      handleOpenDetails(app);
    }
  };

  const handleNavigateToChat = (userId: string) => {
    setPreviousView(currentView);
    setChatTargetUserId(userId);
    setCurrentView('messages');
  };

  const handleDuplicateAppointment = (appointment: Appointment) => {
    setInitialDate(appointment.date);
    // Map attendees to user IDs
    const userIds = appointment.attendees?.map(a => a.user_id) || [];
    setInitialSelectedUsers(userIds);
    setDuplicateAppointment(appointment);
    setIsModalOpen(true);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'calendar':
        return (
          <CalendarView
            onOpenModal={(date) => {
              setInitialDate(date);
              setInitialSelectedUsers([]);
              setDuplicateAppointment(null);
              setIsModalOpen(true);
            }}
            onChangeView={setCurrentView}
            onOpenDetails={handleOpenDetails}
            user={currentUser}
            selectedSectorIds={selectedSectorIds}
            appointmentTypes={appointmentTypes}
            onNavigateToChat={handleNavigateToChat}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onDuplicate={handleDuplicateAppointment}
          />
        );
      case 'list':
        return (
          <AppointmentListView
            onChangeView={setCurrentView}
            onOpenDetails={handleOpenDetails}
            user={currentUser}
            selectedSectorIds={selectedSectorIds}
            appointmentTypes={appointmentTypes}
            sectors={sectors}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onDuplicate={handleDuplicateAppointment}
          />
        );
      case 'team':
        return <TeamView
          onChangeView={setCurrentView}
          currentUser={currentUser}
          sectors={sectors}
          onOpenModal={(participants) => {
            setInitialDate(undefined);
            setInitialSelectedUsers(participants || []);
            setDuplicateAppointment(null);
            setIsModalOpen(true);
          }}
          onNavigateToChat={handleNavigateToChat}
          onToggleSidebar={() => setIsSidebarOpen(true)}
        />;
      case 'performance':
        return <PerformanceView />;
      case 'settings':
        return <SettingsView
          user={currentUser}
          appointmentTypes={appointmentTypes}
          onUpdateTypes={fetchData}
          onToggleSidebar={() => setIsSidebarOpen(true)}
        />;
      case 'messages':
        return (
          <MessagesView
            currentUser={currentUser}
            initialSelectedUserId={chatTargetUserId}
            onOpenModal={(userId) => {
              setInitialDate(undefined);
              setInitialSelectedUsers(userId ? [userId] : []);
              setDuplicateAppointment(null);
              setIsModalOpen(true);
            }}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onBack={previousView ? () => setCurrentView(previousView) : undefined}
          />
        );
      case 'notifications':
        return (
          <NotificationsView
            user={currentUser}
            onViewAppointment={openAppointmentById}
            onNavigateToChat={handleNavigateToChat}
            onToggleSidebar={() => setIsSidebarOpen(true)}
          />
        );
      default:
        return (
          <CalendarView
            onOpenModal={(date) => {
              setInitialDate(date);
              setInitialSelectedUsers([]);
              setDuplicateAppointment(null);
              setIsModalOpen(true);
            }}
            onChangeView={setCurrentView}
            onOpenDetails={handleOpenDetails}
            user={currentUser}
            selectedSectorIds={selectedSectorIds}
            appointmentTypes={appointmentTypes}
            onNavigateToChat={handleNavigateToChat}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onDuplicate={handleDuplicateAppointment}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (currentView === 'login' && !session) {
    return <LoginView />;
  }

  if (currentView === 'details' && selectedAppointment) {
    return (
      <>
        <AppointmentDetailView
          appointment={selectedAppointment}
          user={currentUser}
          appointmentTypes={appointmentTypes}
          onBack={() => {
            if (previousView) {
              setCurrentView(previousView);
            } else {
              setCurrentView('calendar');
            }
          }}
          onNavigateToChat={handleNavigateToChat}
          onDuplicate={handleDuplicateAppointment}
        />
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setInitialDate(undefined);
            setDuplicateAppointment(null);
          }}
          user={currentUser}
          appointmentTypes={appointmentTypes}
          initialDate={initialDate}
          initialSelectedUsers={initialSelectedUsers}
          initialAppointment={duplicateAppointment}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden font-sans">
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        onLogout={handleLogout}
        user={currentUser}
        sectors={sectors}
        selectedSectorIds={selectedSectorIds}
        onFilterChange={setSelectedSectorIds}
        onViewAppointment={openAppointmentById}
        onUpdateProfile={() => fetchData(session?.user.id)}
        onNavigateToChat={handleNavigateToChat}
        unreadCount={unreadCount}
        pendingNotificationsCount={pendingNotificationsCount}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col min-w-0 h-full relative pb-16 md:pb-0">
        {renderContent()}
        <Footer />
      </main>

      <MobileNav
        currentView={currentView}
        onChangeView={setCurrentView}
        unreadCount={unreadCount}
        onToggleSidebar={() => setIsSidebarOpen(true)}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setInitialDate(undefined);
          setDuplicateAppointment(null);
        }}
        user={currentUser}
        appointmentTypes={appointmentTypes}
        initialDate={initialDate}
        initialSelectedUsers={initialSelectedUsers}
        initialAppointment={duplicateAppointment}
      />
    </div>
  );
};

export default App;
