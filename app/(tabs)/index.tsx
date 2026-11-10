import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import colors from '@/constants/colors';
import {
  DollarSign,
  Calendar,
  Users,
  LogOut,
  Scissors,
  CalendarCheck,
  Sparkles,
  X,
  Send,
  Menu,
  Home,
  ShoppingCart,
  FileText,
  FolderOpen,
  UserCircle,
  ChevronRight,
  Database,
} from 'lucide-react-native';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-metrics', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return null;

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

      const [salesResult, appointmentsResult, clientsResult] = await Promise.all([
        supabase
          .from('sales')
          .select('total, sale_date')
          .eq('tenant_id', user.tenant_id)
          .gte('sale_date', weekStart.toISOString())
          .lte('sale_date', weekEnd.toISOString()),

        supabase
          .from('appointments')
          .select('id, status')
          .eq('tenant_id', user.tenant_id)
          .gte('scheduled_at', weekStart.toISOString())
          .lte('scheduled_at', weekEnd.toISOString()),

        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenant_id),
      ]);

      const totalRevenue = salesResult.data?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0;
      const totalSales = salesResult.data?.length || 0;
      const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
      const totalAppointments = appointmentsResult.data?.length || 0;
      const completedAppointments = appointmentsResult.data?.filter(a => a.status === 'completed').length || 0;
      const totalClients = clientsResult.count || 0;

      return {
        totalRevenue,
        totalSales,
        avgTicket,
        totalAppointments,
        completedAppointments,
        totalClients,
      };
    },
    enabled: !!user?.tenant_id,
  });

  const handleLogout = async () => {
    try {
      setShowMenu(false);
      await signOut();
    } catch (error) {
      console.error('[Dashboard] Logout error:', error);
    }
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
        handleLogout();
      } else {
        router.push(route as any);
      }
    }, 300);
  };

  const handleAIQuery = async () => {
    if (!aiInput.trim() || aiLoading) return;

    const userMessage = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiLoading(true);

    try {
      const apiKey = Constants.expoConfig?.extra?.groqApiKey || process.env.EXPO_PUBLIC_GROQ_API_KEY;
      
      if (!apiKey) {
        throw new Error('API Key da Groq não configurada. Adicione EXPO_PUBLIC_GROQ_API_KEY no arquivo .env');
      }

      const context = `Você é um assistente de IA para um sistema de barbearia. 
      O usuário tem acesso às seguintes informações:
      - Vendas totais da semana: R$ ${metrics?.totalRevenue.toFixed(2) || '0.00'}
      - Número de vendas: ${metrics?.totalSales || 0}
      - Atendimentos: ${metrics?.completedAppointments || 0}/${metrics?.totalAppointments || 0}
      - Total de clientes: ${metrics?.totalClients || 0}
      
      Responda de forma profissional e útil em português.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        
        body: JSON.stringify({
          messages: [
            { role: 'system', content: context },
            ...aiMessages,
            { role: 'user', content: userMessage }
          ],
          model: 'llama3-8b-8192',
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AI] API Error:', errorData);
        throw new Error(errorData.error?.message || 'Erro ao consultar IA');
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua solicitação.';
      
      setAiMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('[AI] Error:', error);
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.' 
      }]);
    } finally {
      setAiLoading(false);
    }
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
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)')}
            >
              <Home size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Dashboard (Início)</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                toggleMenu();
                setTimeout(() => setShowAgendaModal(true), 300);
              }}
            >
              <CalendarCheck size={22} color='#3B82F6' strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda de Compromisso</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                toggleMenu();
                setTimeout(() => setShowAIModal(true), 300);
              }}
            >
              <Sparkles size={22} color='#8B5CF6' strokeWidth={2} />
              <Text style={styles.menuItemText}>IA Insights</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/clientes/gerenciar')}
            >
              <Users size={22} color='#10B981' strokeWidth={2} />
              <Text style={styles.menuItemText}>Gerenciar Clientes</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/servicos/gerenciar')}
            >
              <Scissors size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Gerenciar Serviços</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Navegação</Text>
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/agenda')}
            >
              <Calendar size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/vendas')}
            >
              <ShoppingCart size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Vendas</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/relatorios')}
            >
              <FileText size={22} color={colors.accent} strokeWidth={2} />
              <Text style={styles.menuItemText}>Relatórios</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/cadastros')}
            >
              <FolderOpen size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Cadastros</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Conta</Text>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/backup')}
            >
              <Database size={22} color='#F59E0B' strokeWidth={2} />
              <Text style={styles.menuItemText}>Backup de Dados</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/perfil')}
            >
              <UserCircle size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Perfil (Gerenciar)</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => navigateAndCloseMenu('logout')}
            >
              <LogOut size={22} color={colors.error} strokeWidth={2} />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Sair</Text>
              <ChevronRight size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
              <Menu size={28} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.headerLeft}>
              <Scissors size={32} color={colors.primary} strokeWidth={2} />
              <View>
                <Text style={styles.greeting}>Olá, {user?.full_name?.split(' ')[0] || 'Usuário'}!</Text>
                <Text style={styles.role}>
                  {user?.role === 'admin' ? 'Administrador' :
                   user?.role === 'barber' ? 'Barbeiro' : 'Atendente'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <LogOut size={24} color={colors.error} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
          Semana de {format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'dd/MM', { locale: ptBR })} a {format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'dd/MM', { locale: ptBR })}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <View style={styles.metricIcon}>
              <DollarSign size={24} color={colors.surface} strokeWidth={2.5} />
            </View>
            <Text style={styles.metricValue}>
              R$ {metrics?.totalRevenue.toFixed(2) || '0.00'}
            </Text>
            <Text style={styles.metricLabel}>Faturamento</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, styles.metricIconSecondary]}>
              <Calendar size={24} color={colors.secondary} strokeWidth={2.5} />
            </View>
            <Text style={styles.metricValue}>
              {metrics?.completedAppointments || 0}/{metrics?.totalAppointments || 0}
            </Text>
            <Text style={styles.metricLabel}>Atendimentos</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, styles.metricIconInfo]}>
              <Users size={24} color={colors.primary} strokeWidth={2.5} />
            </View>
            <Text style={styles.metricValue}>
              {metrics?.totalClients || 0}
            </Text>
            <Text style={styles.metricLabel}>Clientes</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acesso Rápido</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionPrimary]}
              onPress={() => router.push('/agenda')}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconPrimary]}>
                <Calendar size={24} color={colors.primary} strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Nova Agenda</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionSecondary]}
              onPress={() => router.push('/vendas')}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconSecondary]}>
                <DollarSign size={24} color={colors.secondary} strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Nova Venda</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionInfo]}
              onPress={() => setShowAgendaModal(true)}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconInfo]}>
                <CalendarCheck size={24} color='#3B82F6' strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Agenda de Compromisso</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionAI]}
              onPress={() => setShowAIModal(true)}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconAI]}>
                <Sparkles size={24} color='#8B5CF6' strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>IA Insights</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionClients]}
              onPress={() => router.push('/clientes/gerenciar')}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconClients]}>
                <Users size={24} color='#10B981' strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Gerenciar Clientes</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionServices]}
              onPress={() => router.push('/servicos/gerenciar')}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconServices]}>
                <Scissors size={24} color={colors.secondary} strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Gerenciar Serviços</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.quickAction, styles.quickActionBackup]}
              onPress={() => router.push('/backup')}
            >
              <View style={[styles.quickActionIcon, styles.quickActionIconBackup]}>
                <Database size={24} color='#F59E0B' strokeWidth={2.5} />
              </View>
              <Text style={styles.quickActionText}>Backup de Dados</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={showAgendaModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAgendaModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Agenda de Compromissos</Text>
                <TouchableOpacity onPress={() => setShowAgendaModal(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.agendaSection}>
                  <View style={styles.agendaSummary}>
                    <View style={styles.agendaSummaryCard}>
                      <CalendarCheck size={32} color={colors.primary} strokeWidth={2} />
                      <Text style={styles.agendaSummaryValue}>{metrics?.totalAppointments || 0}</Text>
                      <Text style={styles.agendaSummaryLabel}>Total Agendado</Text>
                    </View>
                    <View style={styles.agendaSummaryCard}>
                      <Calendar size={32} color={colors.secondary} strokeWidth={2} />
                      <Text style={styles.agendaSummaryValue}>{metrics?.completedAppointments || 0}</Text>
                      <Text style={styles.agendaSummaryLabel}>Completados</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={styles.agendaButton}
                    onPress={() => {
                      setShowAgendaModal(false);
                      router.push('/agenda');
                    }}
                  >
                    <Calendar size={20} color={colors.surface} />
                    <Text style={styles.agendaButtonText}>Ver Agenda Completa</Text>
                  </TouchableOpacity>

                  <Text style={styles.agendaInfoText}>
                    Acesse a agenda completa para visualizar todos os compromissos, 
                    criar novos agendamentos e gerenciar seus atendimentos.
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showAIModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAIModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.aiHeaderLeft}>
                  <Sparkles size={24} color='#8B5CF6' strokeWidth={2} />
                  <Text style={styles.modalTitle}>IA Insights</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAIModal(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.aiMessagesContainer} showsVerticalScrollIndicator={false}>
                {aiMessages.length === 0 ? (
                  <View style={styles.aiWelcome}>
                    <Sparkles size={48} color='#8B5CF6' strokeWidth={1.5} />
                    <Text style={styles.aiWelcomeTitle}>Olá! Como posso ajudar?</Text>
                    <Text style={styles.aiWelcomeText}>
                      Faça perguntas sobre suas vendas, agendamentos, clientes e relatórios. 
                      Posso fornecer insights e análises dos seus dados.
                    </Text>
                    <View style={styles.aiSuggestions}>
                      <TouchableOpacity 
                        style={styles.aiSuggestionChip}
                        onPress={() => setAiInput('Qual foi o desempenho das vendas esta semana?')}
                      >
                        <Text style={styles.aiSuggestionText}>Desempenho das vendas</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.aiSuggestionChip}
                        onPress={() => setAiInput('Como está a taxa de conclusão dos agendamentos?')}
                      >
                        <Text style={styles.aiSuggestionText}>Taxa de conclusão</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.aiSuggestionChip}
                        onPress={() => setAiInput('Quais insights você pode dar sobre meu negócio?')}
                      >
                        <Text style={styles.aiSuggestionText}>Insights do negócio</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.aiMessages}>
                    {aiMessages.map((msg, index) => (
                      <View 
                        key={index} 
                        style={[
                          styles.aiMessage,
                          msg.role === 'user' ? styles.aiMessageUser : styles.aiMessageAssistant
                        ]}
                      >
                        <Text style={[
                          styles.aiMessageText,
                          msg.role === 'user' ? styles.aiMessageTextUser : styles.aiMessageTextAssistant
                        ]}>
                          {msg.content}
                        </Text>
                      </View>
                    ))}
                    {aiLoading && (
                      <View style={styles.aiLoadingContainer}>
                        <ActivityIndicator size="small" color='#8B5CF6' />
                        <Text style={styles.aiLoadingText}>Processando...</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={styles.aiInputContainer}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Pergunte algo sobre seus dados..."
                  placeholderTextColor={colors.textSecondary}
                  value={aiInput}
                  onChangeText={setAiInput}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity 
                  style={[styles.aiSendButton, (!aiInput.trim() || aiLoading) && styles.aiSendButtonDisabled]}
                  onPress={handleAIQuery}
                  disabled={!aiInput.trim() || aiLoading}
                >
                  {aiLoading ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Send size={20} color={colors.surface} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
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
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: colors.text,
  },
  role: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  metricsGrid: {
    paddingHorizontal: 20,
    gap: 12,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  metricCardPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricIconSecondary: {
    backgroundColor: `${colors.secondary}15` as const,
  },
  metricIconInfo: {
    backgroundColor: `${colors.primary}15` as const,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500' as const,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    width: (width - 52) / 2,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionPrimary: {
    borderColor: `${colors.primary}20` as const,
  },
  quickActionSecondary: {
    borderColor: `${colors.secondary}20` as const,
  },
  quickActionInfo: {
    borderColor: '#3B82F620',
  },
  quickActionAI: {
    borderColor: '#8B5CF620',
  },
  quickActionClients: {
    borderColor: '#10B98120',
  },
  quickActionServices: {
    borderColor: `${colors.secondary}20` as const,
  },
  quickActionBackup: {
    borderColor: '#F59E0B20',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionIconPrimary: {
    backgroundColor: `${colors.primary}15` as const,
  },
  quickActionIconSecondary: {
    backgroundColor: `${colors.secondary}15` as const,
  },
  quickActionIconInfo: {
    backgroundColor: '#3B82F615',
  },
  quickActionIconAI: {
    backgroundColor: '#8B5CF615',
  },
  quickActionIconClients: {
    backgroundColor: '#10B98115',
  },
  quickActionIconServices: {
    backgroundColor: `${colors.secondary}15` as const,
  },
  quickActionIconBackup: {
    backgroundColor: '#FEF3C7',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  agendaSection: {
    gap: 20,
    paddingBottom: 20,
  },
  agendaSummary: {
    flexDirection: 'row',
    gap: 12,
  },
  agendaSummaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  agendaSummaryValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
  },
  agendaSummaryLabel: {
    fontSize: 13,
    lineHeight: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false
  },
  agendaButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  agendaButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.surface,
  },
  agendaInfoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  aiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiMessagesContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  aiWelcome: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  aiWelcomeTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
    marginTop: 16,
  },
  aiWelcomeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  aiSuggestions: {
    marginTop: 24,
    gap: 10,
    width: '100%',
  },
  aiSuggestionChip: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#8B5CF620',
  },
  aiSuggestionText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  aiMessages: {
    gap: 12,
    paddingBottom: 20,
  },
  aiMessage: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 16,
  },
  aiMessageUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#8B5CF6',
  },
  aiMessageAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  aiMessageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  aiMessageTextUser: {
    color: colors.surface,
  },
  aiMessageTextAssistant: {
    color: colors.text,
  },
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  aiLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  aiInputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 12,
    backgroundColor: colors.background,
  },
  aiInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiSendButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiSendButtonDisabled: {
    opacity: 0.5,
  },
});