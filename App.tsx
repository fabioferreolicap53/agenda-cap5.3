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
import { ResetPasswordView } from './views/ResetPasswordView';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { User as AppUser, Appointment, Sector, AppointmentType } from './types';
import { useCallback } from 'react';


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
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

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
        status: profile.status,
        phone: profile.phone
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
    // Check for recovery type in hash early
    const isInitialRecovery = window.location.hash.includes('type=recovery');
    if (isInitialRecovery) {
      setIsRecovering(true);
      setCurrentView('reset_password');
    }

    // Check for errors in URL hash (e.g., from failed password reset)
    const hash = window.location.hash;

    if (hash && hash.includes('error=')) {
      try {
        const hashContent = hash.startsWith('#') ? hash.substring(1) : hash;
        const params = new URLSearchParams(hashContent);
        const errorMsg = params.get('error_description') || params.get('error');
        if (errorMsg) {
          setAuthError(decodeURIComponent(errorMsg).replace(/\+/g, ' '));
          // Clear hash to prevent repeated error messages
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (e) {
        console.error('Error parsing hash:', e);
      }
    }

    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchData(session.user.id);

        // IMPORTANT: DO NOT redirect to calendar if we are in recovery mode
        if (!isInitialRecovery && !window.location.hash.includes('type=recovery')) {
          setCurrentView('calendar');
        } else {
          setIsRecovering(true);
          setCurrentView('reset_password');
        }
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      const isRecoverySession = event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery');

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
        setCurrentView('reset_password');
      } else if (session) {
        fetchData(session.user.id);

        // Only redirect to calendar if NOT in the middle of a password recovery
        if (!isRecovering && !isRecoverySession && (currentView === 'login' || currentView === 'reset_password')) {
          setCurrentView('calendar');
        } else if (isRecoverySession) {
          setIsRecovering(true);
          setCurrentView('reset_password');
        }
      } else {
        setCurrentUser(null);
        setCurrentView('login');
        setIsRecovering(false);
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

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state || {};

      // Handle Modal via History
      if (state.modal) {
        setIsModalOpen(true);
      } else {
        // If we pop to a state without 'modal', close it
        setIsModalOpen(false);
        setInitialDate(undefined);
        setDuplicateAppointment(null);
      }

      // Handle View
      if (state.view) {
        setCurrentView(state.view);
        setPreviousView(state.previousView || 'calendar');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const changeView = (view: ViewState) => {
    setCurrentView(view);
    window.history.pushState({ view, previousView: currentView }, '', `#${view}`);
  };


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
    changeView('details');
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
    changeView('messages');
  };

  const handleDuplicateAppointment = (appointment: Appointment) => {
    setInitialDate(appointment.date);
    // Map attendees to user IDs
    const userIds = appointment.attendees?.map(a => a.user_id) || [];
    setInitialSelectedUsers(userIds);
    setDuplicateAppointment(appointment);

    // Push modal state
    window.history.pushState({ ...window.history.state, modal: true }, '', '');
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
              window.history.pushState({ ...window.history.state, modal: true }, '', '');
              setIsModalOpen(true);
            }}
            onChangeView={changeView}
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
            onChangeView={changeView}
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
          onChangeView={changeView}
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
        return <PerformanceView onToggleSidebar={() => setIsSidebarOpen(true)} />;
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
            onBack={previousView ? () => changeView(previousView) : undefined}
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
      case 'reset_password':
        return (
          <ResetPasswordView
            onSuccess={() => {
              setIsRecovering(false);
              setAuthError(null);
              setCurrentView('calendar');
            }}
            onCancel={() => {
              setIsRecovering(false);
              setAuthError(null);
              supabase.auth.signOut();
              setCurrentView('login');
            }}
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
            onChangeView={changeView}
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
    return <LoginView externalError={authError} />;
  }

  if (currentView === 'reset_password') {
    return (
      <ResetPasswordView
        onSuccess={() => {
          setIsRecovering(false);
          setAuthError(null);
          setCurrentView('calendar');
        }}
        onCancel={() => {
          setIsRecovering(false);
          setAuthError(null);
          supabase.auth.signOut();
          setCurrentView('login');
        }}
      />
    );
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
              changeView(previousView);
            } else {
              changeView('calendar');
            }
          }}
          onNavigateToChat={handleNavigateToChat}
          onDuplicate={handleDuplicateAppointment}
        />
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            // Navigating back will trigger the popstate listener which closes the modal
            window.history.back();
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
        onChangeView={changeView}
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
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {renderContent()}
        <Footer />
      </main>



      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          window.history.back();
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
