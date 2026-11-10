import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import colors from '@/constants/colors';
import {
  Plus,
  Search,
  Scissors,
  Clock,
  DollarSign,
  X,
  Check,
  Edit2,
  Trash2,
  Menu,
  Home,
  ShoppingCart,
  FileText,
  FolderOpen,
  UserCircle,
  ChevronRight,
  BarChart3,
  CalendarCheck,
  Sparkles,
  LogOut,
  Users,
  Calendar,
  TrendingUp,

} from 'lucide-react-native';
import type { Service } from '@/types/database';
import { useRouter } from 'expo-router';

type ServiceWithStats = Service & {
  total_sales?: number;
  total_revenue?: number;
};

export default function GerenciarServicosScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [editingServico, setEditingServico] = useState<ServiceWithStats | null>(null);
  const [selectedServico, setSelectedServico] = useState<ServiceWithStats | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    duration_minutes: '',
    description: '',
    is_active: true,
  });

  const { data: servicos, isLoading } = useQuery({
    queryKey: ['servicos-stats', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];

      const { data: servicesData, error } = await supabase
        .from('services')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Servicos] Error fetching services:', error);
        throw error;
      }

      const servicesWithStats = await Promise.all(
        (servicesData || []).map(async (service) => {
          const { data: salesData } = await supabase
            .from('sale_items')
            .select('quantity, price')
            .eq('service_id', service.id);

          const totalSales = salesData?.reduce((sum, item) => sum + item.quantity, 0) || 0;
          const totalRevenue = salesData?.reduce((sum, item) => sum + (item.quantity * Number(item.price)), 0) || 0;

          return {
            ...service,
            total_sales: totalSales,
            total_revenue: totalRevenue,
          };
        })
      );

      return servicesWithStats;
    },
    enabled: !!user?.tenant_id,
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: newService, error } = await supabase
        .from('services')
        .insert([
          {
            tenant_id: user!.tenant_id,
            name: data.name,
            price: parseFloat(data.price),
            duration_minutes: parseInt(data.duration_minutes),
            description: data.description || null,
            is_active: data.is_active,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return newService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos-stats'] });
      Alert.alert('Sucesso', 'Serviço criado com sucesso!');
      handleCloseModal();
    },
    onError: (error: any) => {
      console.error('[Servicos] Create error:', error);
      Alert.alert('Erro', 'Não foi possível criar o serviço');
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const { data: updatedService, error } = await supabase
        .from('services')
        .update({
          name: data.name,
          price: parseFloat(data.price),
          duration_minutes: parseInt(data.duration_minutes),
          description: data.description || null,
          is_active: data.is_active,
        })
        .eq('id', data.id)
        .select()
        .single();

      if (error) throw error;
      return updatedService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos-stats'] });
      Alert.alert('Sucesso', 'Serviço atualizado com sucesso!');
      handleCloseModal();
    },
    onError: (error: any) => {
      console.error('[Servicos] Update error:', error);
      Alert.alert('Erro', 'Não foi possível atualizar o serviço');
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicos-stats'] });
      Alert.alert('Sucesso', 'Serviço excluído com sucesso!');
      setDetailsModalVisible(false);
    },
    onError: (error: any) => {
      console.error('[Servicos] Delete error:', error);
      Alert.alert('Erro', 'Não foi possível excluir o serviço');
    },
  });

  const filteredServicos = useMemo(() => {
    if (!servicos) return [];
    
    let filtered = servicos;

    if (searchQuery) {
      filtered = filtered.filter((servico) =>
        servico.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        servico.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterActive !== null) {
      filtered = filtered.filter((servico) => servico.is_active === filterActive);
    }

    return filtered;
  }, [servicos, searchQuery, filterActive]);

  const stats = useMemo(() => {
    if (!servicos) return { total: 0, active: 0, totalRevenue: 0, avgPrice: 0 };

    const total = servicos.length;
    const active = servicos.filter((s) => s.is_active).length;
    const totalRevenue = servicos.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
    const avgPrice = total > 0 ? servicos.reduce((sum, s) => sum + Number(s.price), 0) / total : 0;

    return { total, active, totalRevenue, avgPrice };
  }, [servicos]);

  const handleOpenModal = (servico?: ServiceWithStats) => {
    if (servico) {
      setEditingServico(servico);
      setFormData({
        name: servico.name,
        price: servico.price.toString(),
        duration_minutes: servico.duration_minutes.toString(),
        description: servico.description || '',
        is_active: servico.is_active,
      });
    } else {
      setEditingServico(null);
      setFormData({
        name: '',
        price: '',
        duration_minutes: '',
        description: '',
        is_active: true,
      });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingServico(null);
    setFormData({
      name: '',
      price: '',
      duration_minutes: '',
      description: '',
      is_active: true,
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.price || !formData.duration_minutes) {
      Alert.alert('Erro', 'Nome, preço e duração são obrigatórios');
      return;
    }

    if (editingServico) {
      updateServiceMutation.mutate({ ...formData, id: editingServico.id });
    } else {
      createServiceMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir este serviço?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteServiceMutation.mutate(id),
        },
      ]
    );
  };

  const handleOpenDetails = (servico: ServiceWithStats) => {
    setSelectedServico(servico);
    setDetailsModalVisible(true);
  };

  const handleLogout = async () => {
    try {
      setShowMenu(false);
      await signOut();
    } catch (error) {
      console.error('[Servicos] Logout error:', error);
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
              onPress={() => navigateAndCloseMenu('/(tabs)')}
            >
              <BarChart3 size={22} color={colors.accent} strokeWidth={2} />
              <Text style={styles.menuItemText}>Gráficos</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)/agenda')}
            >
              <CalendarCheck size={22} color='#3B82F6' strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda de Compromisso</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)')}
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
              onPress={() => navigateAndCloseMenu('/(tabs)/agenda')}
            >
              <Calendar size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)/vendas')}
            >
              <ShoppingCart size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Vendas</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)/relatorios')}
            >
              <FileText size={22} color={colors.accent} strokeWidth={2} />
              <Text style={styles.menuItemText}>Relatórios</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigateAndCloseMenu('/(tabs)/cadastros')}
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

      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
              <Menu size={28} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.title}>Gerenciar Serviços</Text>
          </View>
          <Text style={styles.subtitle}>
            Controle completo dos seus serviços e produtos
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardPrimary]}>
            <View style={styles.statIcon}>
              <Scissors size={24} color={colors.surface} strokeWidth={2.5} />
            </View>
            <Text style={[styles.statValue, styles.statValueLight]}>{stats.total}</Text>
            <Text style={[styles.statLabel, styles.statLabelLight]}>Total de Serviços</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconSecondary]}>
              <Check size={24} color={colors.success} strokeWidth={2.5} />
            </View>
            <Text style={styles.statValue}>{stats.active}</Text>
            <Text style={styles.statLabel}>Serviços Ativos</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconAccent]}>
              <DollarSign size={24} color={colors.secondary} strokeWidth={2.5} />
            </View>
            <Text style={styles.statValue}>R$ {stats.totalRevenue.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Receita Total</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconInfo]}>
              <TrendingUp size={24} color={colors.accent} strokeWidth={2.5} />
            </View>
            <Text style={styles.statValue}>R$ {stats.avgPrice.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Preço Médio</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <Search size={20} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar serviços..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleOpenModal()}
              activeOpacity={0.7}
            >
              <Plus size={24} color={colors.surface} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterChip, filterActive === null && styles.filterChipActive]}
              onPress={() => setFilterActive(null)}
            >
              <Text style={[styles.filterChipText, filterActive === null && styles.filterChipTextActive]}>
                Todos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterActive === true && styles.filterChipActive]}
              onPress={() => setFilterActive(true)}
            >
              <Check size={14} color={filterActive === true ? colors.surface : colors.success} strokeWidth={2} />
              <Text style={[styles.filterChipText, filterActive === true && styles.filterChipTextActive]}>
                Ativos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterActive === false && styles.filterChipActive]}
              onPress={() => setFilterActive(false)}
            >
              <X size={14} color={filterActive === false ? colors.surface : colors.error} strokeWidth={2} />
              <Text style={[styles.filterChipText, filterActive === false && styles.filterChipTextActive]}>
                Inativos
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.servicosList}>
            {filteredServicos.length === 0 ? (
              <View style={styles.emptyState}>
                <Scissors size={48} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={styles.emptyStateTitle}>Nenhum serviço encontrado</Text>
                <Text style={styles.emptyStateText}>
                  {searchQuery || filterActive !== null
                    ? 'Tente ajustar os filtros de busca'
                    : 'Comece adicionando seu primeiro serviço'}
                </Text>
              </View>
            ) : (
              filteredServicos.map((servico) => (
                <TouchableOpacity
                  key={servico.id}
                  style={[styles.servicoCard, !servico.is_active && styles.servicoCardInactive]}
                  onPress={() => handleOpenDetails(servico)}
                  activeOpacity={0.7}
                >
                  <View style={styles.servicoHeader}>
                    <View style={[styles.servicoIcon, !servico.is_active && styles.servicoIconInactive]}>
                      <Scissors size={24} color={servico.is_active ? colors.secondary : colors.textSecondary} strokeWidth={2} />
                    </View>
                    <View style={styles.servicoInfo}>
                      <View style={styles.servicoNameRow}>
                        <Text style={[styles.servicoName, !servico.is_active && styles.servicoNameInactive]}>
                          {servico.name}
                        </Text>
                        {!servico.is_active && (
                          <View style={styles.inactiveBadge}>
                            <Text style={styles.inactiveText}>INATIVO</Text>
                          </View>
                        )}
                      </View>
                      {servico.description && (
                        <Text style={styles.servicoDescription} numberOfLines={2}>
                          {servico.description}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.servicoStats}>
                    <View style={styles.servicoStatItem}>
                      <DollarSign size={16} color={colors.success} strokeWidth={2} />
                      <Text style={styles.servicoStatValue}>R$ {Number(servico.price).toFixed(2)}</Text>
                      <Text style={styles.servicoStatLabel}>Preço</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.servicoStatItem}>
                      <Clock size={16} color={colors.primary} strokeWidth={2} />
                      <Text style={styles.servicoStatValue}>{servico.duration_minutes} min</Text>
                      <Text style={styles.servicoStatLabel}>Duração</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.servicoStatItem}>
                      <TrendingUp size={16} color={colors.accent} strokeWidth={2} />
                      <Text style={styles.servicoStatValue}>{servico.total_sales || 0}</Text>
                      <Text style={styles.servicoStatLabel}>Vendas</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingServico ? 'Editar Serviço' : 'Novo Serviço'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome do Serviço *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Corte Masculino"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Preço (R$) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.price}
                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Duração (min) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="30"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.duration_minutes}
                    onChangeText={(text) => setFormData({ ...formData, duration_minutes: text })}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Descrição</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Descrição detalhada do serviço..."
                  placeholderTextColor={colors.textSecondary}
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={styles.activeToggle}
                onPress={() => setFormData({ ...formData, is_active: !formData.is_active })}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, formData.is_active && styles.checkboxActive]}>
                  {formData.is_active && <Check size={16} color={colors.surface} strokeWidth={3} />}
                </View>
                <Text style={styles.activeToggleText}>Serviço ativo e disponível</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCloseModal}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (createServiceMutation.isPending || updateServiceMutation.isPending) && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={createServiceMutation.isPending || updateServiceMutation.isPending}
                activeOpacity={0.7}
              >
                {createServiceMutation.isPending || updateServiceMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <>
                    <Check size={20} color={colors.surface} strokeWidth={2.5} />
                    <Text style={styles.saveButtonText}>Salvar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes do Serviço</Text>
              <TouchableOpacity
                onPress={() => setDetailsModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedServico && (
              <ScrollView style={styles.detailsContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.detailsHeader}>
                  <View style={[styles.detailsIcon, !selectedServico.is_active && styles.detailsIconInactive]}>
                    <Scissors size={32} color={selectedServico.is_active ? colors.secondary : colors.textSecondary} strokeWidth={2} />
                  </View>
                  <View style={styles.detailsNameContainer}>
                    <Text style={styles.detailsName}>{selectedServico.name}</Text>
                    {!selectedServico.is_active && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveText}>INATIVO</Text>
                      </View>
                    )}
                  </View>
                </View>

                {selectedServico.description && (
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsSectionTitle}>Descrição</Text>
                    <Text style={styles.detailsDescription}>{selectedServico.description}</Text>
                  </View>
                )}

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Informações</Text>
                  <View style={styles.detailsRow}>
                    <DollarSign size={20} color={colors.textSecondary} />
                    <Text style={styles.detailsLabel}>Preço:</Text>
                    <Text style={styles.detailsValue}>R$ {Number(selectedServico.price).toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Clock size={20} color={colors.textSecondary} />
                    <Text style={styles.detailsLabel}>Duração:</Text>
                    <Text style={styles.detailsValue}>{selectedServico.duration_minutes} minutos</Text>
                  </View>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Estatísticas</Text>
                  <View style={styles.detailsStatsGrid}>
                    <View style={styles.detailsStatCard}>
                      <TrendingUp size={24} color={colors.accent} strokeWidth={2} />
                      <Text style={styles.detailsStatValue}>{selectedServico.total_sales || 0}</Text>
                      <Text style={styles.detailsStatLabel}>Total de Vendas</Text>
                    </View>
                    <View style={styles.detailsStatCard}>
                      <DollarSign size={24} color={colors.success} strokeWidth={2} />
                      <Text style={styles.detailsStatValue}>
                        R$ {(selectedServico.total_revenue || 0).toFixed(2)}
                      </Text>
                      <Text style={styles.detailsStatLabel}>Receita Gerada</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailsActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setDetailsModalVisible(false);
                      handleOpenModal(selectedServico);
                    }}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={20} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.editButtonText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(selectedServico.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={20} color={colors.error} strokeWidth={2} />
                    <Text style={styles.deleteButtonText}>Excluir</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statsGrid: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
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
  statCardPrimary: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statIconSecondary: {
    backgroundColor: `${colors.success}15` as const,
  },
  statIconAccent: {
    backgroundColor: `${colors.secondary}15` as const,
  },
  statIconInfo: {
    backgroundColor: `${colors.accent}15` as const,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  statValueLight: {
    color: colors.surface,
  },
  statLabel: {
    fontSize: 14,
    lineHeight: 14,           // >= fontSize
    color: colors.textSecondary,
    includeFontPadding: false, // reduz padding extra no Android
    fontWeight: '500' as const,
  },
  statLabelLight: {
    color: colors.surface,
    opacity: 0.9,
  },
  section: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  servicosList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  servicoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  servicoCardInactive: {
    opacity: 0.6,
  },
  servicoHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  servicoIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: `${colors.secondary}15` as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
  servicoIconInactive: {
    backgroundColor: `${colors.textSecondary}15` as const,
  },
  servicoInfo: {
    flex: 1,
  },
  servicoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  servicoName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  servicoNameInactive: {
    color: colors.textSecondary,
  },
  inactiveBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inactiveText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.surface,
  },
  servicoDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  servicoStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  servicoStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  servicoStatValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.text,
  },
  servicoStatLabel: {
    fontSize: 11,
    lineHeight: 14,           // >= fontSize
    color: colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false // reduz padding extra no Android
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  formContainer: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    minHeight: 100,
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  activeToggleText: {
    fontSize: 16,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.background,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.surface,
  },
  detailsContainer: {
    padding: 20,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  detailsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.secondary}15` as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsIconInactive: {
    backgroundColor: `${colors.textSecondary}15` as const,
  },
  detailsNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
    flex: 1,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  detailsDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  detailsLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  detailsValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600' as const,
    flex: 1,
    textAlign: 'right',
  },
  detailsStatsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  detailsStatCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsStatValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
  },
  detailsStatLabel: {
    fontSize: 12,
    lineHeight: 14,           // >= fontSize
    color: colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false // reduz padding extra no Android
  },
  detailsActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.primary}15` as const,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.error}15` as const,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.error,
  },
});
