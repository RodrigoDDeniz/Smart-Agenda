import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Appointment, Client, Service, Barber } from '@/types/database';
import colors from '@/constants/colors';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Search, Menu, Home, BarChart3, CalendarCheck, Sparkles, Users as UsersIcon, ShoppingCart, FileText, FolderOpen, UserCircle, LogOut, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { ptBR } from 'date-fns/locale';

export default function AgendaScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showModal, setShowModal] = useState(false);
  const [searchClient, setSearchClient] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-300)).current;

  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['appointments', user?.tenant_id, selectedDate.toDateString()],
    queryFn: async () => {
      if (!user?.tenant_id) return [];

      const dayStart = startOfDay(selectedDate);
      const dayEnd = endOfDay(selectedDate);

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          client:clients(name, phone),
          barber:barbers(id, user:users(full_name)),
          service:services(name, price, duration_minutes)
        `)
        .eq('tenant_id', user.tenant_id)
        .gte('scheduled_at', dayStart.toISOString())
        .lte('scheduled_at', dayEnd.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('[Agenda] Error fetching appointments:', error);
        throw error;
      }

      console.log('[Agenda] Loaded appointments:', data?.length);
      return data as Appointment[];
    },
    enabled: !!user?.tenant_id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'confirmed': return colors.secondary;
      case 'scheduled': return colors.primary;
      case 'in_progress': return colors.accent;
      case 'cancelled': return colors.error;
      case 'no_show': return colors.textLight;
      default: return colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: 'Agendado',
      confirmed: 'Confirmado',
      in_progress: 'Em andamento',
      completed: 'Concluído',
      cancelled: 'Cancelado',
      no_show: 'Faltou',
    };
    return labels[status] || status;
  };

  const { data: clients } = useQuery({
    queryKey: ['clients', user?.tenant_id, searchClient],
    queryFn: async () => {
      if (!user?.tenant_id || searchClient.length < 2) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .or(`name.ilike.%${searchClient}%,phone.ilike.%${searchClient}%`)
        .limit(10);
      
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.tenant_id && searchClient.length >= 2,
  });

  const { data: services } = useQuery({
    queryKey: ['services', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!user?.tenant_id,
  });

  const { data: barbers } = useQuery({
    queryKey: ['barbers', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('barbers')
        .select(`
          *,
          user:users(full_name)
        `)
        .eq('tenant_id', user.tenant_id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data as Barber[];
    },
    enabled: !!user?.tenant_id,
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async () => {
      if (!user?.tenant_id || !selectedClient || !selectedService || !selectedBarber || !selectedTime) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      const [hours, minutes] = selectedTime.split(':');
      const scheduledDate = new Date(selectedDate);
      scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          tenant_id: user.tenant_id,
          client_id: selectedClient.id,
          barber_id: selectedBarber.id,
          service_id: selectedService.id,
          scheduled_at: scheduledDate.toISOString(),
          duration_minutes: selectedService.duration_minutes,
          status: 'scheduled',
          notes: notes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      resetForm();
      setShowModal(false);
      Alert.alert('Sucesso', 'Agendamento criado com sucesso!');
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message);
    },
  });

  const handleNewAppointment = () => {
    resetForm();
    setShowModal(true);
  };

  const toggleMenu = () => {
    if (showMenu) {
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowMenu(false));
    } else {
      setShowMenu(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const navigateAndCloseMenu = (route: string) => {
    toggleMenu();
    setTimeout(() => {
      if (route === 'logout') {
        signOut();
      } else {
        router.push(route as any);
      }
    }, 300);
  };

  const resetForm = () => {
    setSearchClient('');
    setSelectedClient(null);
    setSelectedService(null);
    setSelectedBarber(null);
    setSelectedTime('');
    setNotes('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {showMenu && (
        <Pressable 
          style={styles.menuOverlay} 
          onPress={toggleMenu}
        />
      )}

      <Animated.View
        style={[
          styles.hamburgerMenu,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={styles.menuHeader}>
          <View style={styles.menuUserInfo}>
            <View style={styles.menuUserAvatar}>
              <UserCircle size={48} color={colors.primary} strokeWidth={1.5} />
            </View>
            <View>
              <Text style={styles.menuUserName}>{user?.full_name || 'Usuário'}</Text>
              <Text style={styles.menuUserRole}>
                {user?.role === 'admin' ? 'Administrador' :
                 user?.role === 'barber' ? 'Barbeiro' : 'Atendente'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={toggleMenu} style={styles.menuCloseButton}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.menuContent} showsVerticalScrollIndicator={false}>
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Principal</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/(tabs)')}>
              <Home size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Dashboard (Início)</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/clientes/gerenciar')}>
              <UsersIcon size={22} color='#10B981' strokeWidth={2} />
              <Text style={styles.menuItemText}>Gerenciar Clientes</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Navegação</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/agenda')}>
              <Calendar size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/vendas')}>
              <ShoppingCart size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Vendas</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/relatorios')}>
              <FileText size={22} color={colors.accent} strokeWidth={2} />
              <Text style={styles.menuItemText}>Relatórios</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/cadastros')}>
              <FolderOpen size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Cadastros</Text>
              <ChevronRightIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Conta</Text>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={() => navigateAndCloseMenu('logout')}>
              <LogOut size={22} color={colors.error} strokeWidth={2} />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Sair</Text>
              <ChevronRightIcon size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
            <Menu size={28} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.title}>Agenda</Text>
        </View>
      </View>

      <View style={styles.dateSelector}>
        <TouchableOpacity
          onPress={() => setSelectedDate(addDays(selectedDate, -1))}
          style={styles.dateButton}
        >
          <ChevronLeft size={24} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.dateInfo}>
          <Text style={styles.dateText}>
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </Text>
          {format(new Date(), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Hoje</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
          style={styles.dateButton}
        >
          <ChevronRight size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />
        }
      >
        {appointments && appointments.length > 0 ? (
          <View style={styles.appointmentsList}>
            {appointments.map((appointment) => (
              <View key={appointment.id} style={styles.appointmentCard}>
                <View
                  style={[styles.statusBar, { backgroundColor: getStatusColor(appointment.status) }]}
                />
                <View style={styles.appointmentContent}>
                  <View style={styles.appointmentHeader}>
                    <Text style={styles.appointmentTime}>
                      {format(new Date(appointment.scheduled_at), 'HH:mm')}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${getStatusColor(appointment.status)}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: getStatusColor(appointment.status) },
                        ]}
                      >
                        {getStatusLabel(appointment.status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.clientName}>{appointment.client?.name || 'Cliente'}</Text>
                  <Text style={styles.serviceInfo}>
                    {appointment.service?.name || 'Serviço'} • {appointment.duration_minutes}min
                  </Text>
                  <Text style={styles.barberName}>
                    {appointment.barber?.user?.full_name || 'Barbeiro'}
                  </Text>

                  {appointment.notes && (
                    <Text style={styles.notes} numberOfLines={2}>
                      {appointment.notes}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Calendar size={64} color={colors.textLight} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nenhum agendamento</Text>
            <Text style={styles.emptyText}>
              Não há agendamentos para este dia
            </Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleNewAppointment}>
        <Plus size={28} color={colors.surface} strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Agendamento</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cliente *</Text>
              <TextInput
                style={styles.input}
                placeholder="Buscar cliente por nome ou telefone"
                value={searchClient}
                onChangeText={setSearchClient}
              />
              {selectedClient ? (
                <View style={styles.selectedItem}>
                  <Text style={styles.selectedItemText}>{selectedClient.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedClient(null)}>
                    <X size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                clients && clients.length > 0 && (
                  <View style={styles.searchResults}>
                    {clients.map(client => (
                      <TouchableOpacity
                        key={client.id}
                        style={styles.searchResultItem}
                        onPress={() => {
                          setSelectedClient(client);
                          setSearchClient('');
                        }}
                      >
                        <Text style={styles.searchResultText}>{client.name}</Text>
                        <Text style={styles.searchResultSubtext}>{client.phone}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Serviço *</Text>
              <View style={styles.itemsGrid}>
                {services?.map(service => (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.gridItem,
                      selectedService?.id === service.id && styles.gridItemSelected,
                    ]}
                    onPress={() => setSelectedService(service)}
                  >
                    <Text style={[
                      styles.gridItemText,
                      selectedService?.id === service.id && styles.gridItemTextSelected,
                    ]}>
                      {service.name}
                    </Text>
                    <Text style={[
                      styles.gridItemSubtext,
                      selectedService?.id === service.id && styles.gridItemSubtextSelected,
                    ]}>
                      {service.duration_minutes}min • R$ {Number(service.price).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profissional *</Text>
              <View style={styles.itemsGrid}>
                {barbers?.map(barber => (
                  <TouchableOpacity
                    key={barber.id}
                    style={[
                      styles.gridItem,
                      selectedBarber?.id === barber.id && styles.gridItemSelected,
                    ]}
                    onPress={() => setSelectedBarber(barber)}
                  >
                    <Text style={[
                      styles.gridItemText,
                      selectedBarber?.id === barber.id && styles.gridItemTextSelected,
                    ]}>
                      {barber.user?.full_name || 'Barbeiro'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Horário *</Text>
              <TextInput
                style={styles.input}
                placeholder="HH:MM (ex: 14:30)"
                value={selectedTime}
                onChangeText={setSelectedTime}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Observações</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Observações sobre o agendamento"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Resumo</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Data:</Text>
                <Text style={styles.summaryValue}>
                  {format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </Text>
              </View>
              {selectedTime && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Horário:</Text>
                  <Text style={styles.summaryValue}>{selectedTime}</Text>
                </View>
              )}
              {selectedClient && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Cliente:</Text>
                  <Text style={styles.summaryValue}>{selectedClient.name}</Text>
                </View>
              )}
              {selectedService && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Serviço:</Text>
                  <Text style={styles.summaryValue}>{selectedService.name}</Text>
                </View>
              )}
              {selectedBarber && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Profissional:</Text>
                  <Text style={styles.summaryValue}>{selectedBarber.user?.full_name}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.createButton,
                (!selectedClient || !selectedService || !selectedBarber || !selectedTime || createAppointmentMutation.isPending) && styles.createButtonDisabled,
              ]}
              onPress={() => createAppointmentMutation.mutate()}
              disabled={!selectedClient || !selectedService || !selectedBarber || !selectedTime || createAppointmentMutation.isPending}
            >
              {createAppointmentMutation.isPending ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.createButtonText}>Criar Agendamento</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  hamburgerMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 300,
    height: '100%',
    backgroundColor: colors.surface,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  menuHeader: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  menuUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  menuUserAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${colors.primary}15` as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuUserName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
  },
  menuUserRole: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  menuCloseButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 4,
  },
  menuContent: {
    flex: 1,
    padding: 16,
  },
  menuSection: {
    marginBottom: 8,
  },
  menuSectionTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 4,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  menuItemDanger: {
    backgroundColor: `${colors.error}10` as const,
  },
  menuItemTextDanger: {
    color: colors.error,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 16,
  },
  hamburgerButton: {
    padding: 8,
    marginRight: 8,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dateButton: {
    padding: 8,
  },
  dateInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    textTransform: 'capitalize',
  },
  todayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  appointmentsList: {
    padding: 16,
    gap: 12,
  },
  appointmentCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusBar: {
    width: 4,
  },
  appointmentContent: {
    flex: 1,
    padding: 16,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appointmentTime: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 4,
  },
  serviceInfo: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  barberName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  notes: {
    fontSize: 13,
    color: colors.textLight,
    fontStyle: 'italic' as const,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: colors.text,
  },
  modalContent: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  selectedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  selectedItemText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.surface,
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchResultText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  searchResultSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemsGrid: {
    gap: 8,
  },
  gridItem: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridItemSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gridItemText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  gridItemTextSelected: {
    color: colors.surface,
  },
  gridItemSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  gridItemSubtextSelected: {
    color: colors.surface,
  },
  summarySection: {
    margin: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  createButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: colors.textLight,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.surface,
  },
});
