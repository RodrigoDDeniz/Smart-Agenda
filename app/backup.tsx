import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import colors from '@/constants/colors';
import {
  Database,
  Download,
  Upload,
  HardDrive,
  CheckCircle,
  AlertCircle,
  X,
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
  Scissors,
  Package,
  FileArchive,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BackupData {
  version: string;
  timestamp: string;
  tenant_id: string;
  data: {
    clients: any[];
    services: any[];
    products: any[];
    barbers: any[];
    appointments: any[];
    sales: any[];
    sale_items: any[];
    payments: any[];
    // Novas tabelas adicionadas ao backup
    business_hours: any[];
    payment_methods: any[];
    categories: any[];
    suppliers: any[];
  };
}

export default function BackupScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const { data: backupStats, isLoading: statsLoading } = useQuery({
    queryKey: ['backup-stats', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return null;

      const [
        clientsCount,
        servicesCount,
        productsCount,
        barbersCount,
        appointmentsCount,
        salesCount,
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
        supabase.from('services').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
        supabase.from('barbers').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
        supabase.from('sales').select('*', { count: 'exact', head: true }).eq('tenant_id', user.tenant_id),
      ]);

      return {
        clients: clientsCount.count || 0,
        services: servicesCount.count || 0,
        products: productsCount.count || 0,
        barbers: barbersCount.count || 0,
        appointments: appointmentsCount.count || 0,
        sales: salesCount.count || 0,
      };
    },
    enabled: !!user?.tenant_id,
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      if (!user?.tenant_id) throw new Error('Usuário não autenticado');

      console.log('[Backup] Iniciando backup de dados...');

      const [
        clientsData,
        servicesData,
        productsData,
        barbersData,
        appointmentsData,
        salesData,
        saleItemsData,
        paymentsData,
        businessHoursData,
        paymentMethodsData,
        categoriesData,
        suppliersData
      ] = await Promise.all([
        supabase.from('clients').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('services').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('products').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('barbers').select('*, user:users(*)').eq('tenant_id', user.tenant_id),
        supabase.from('appointments').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('sales').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('sale_items').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('payments').select('*').eq('tenant_id', user.tenant_id),
        // Buscando as novas configurações
        supabase.from('business_hours').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('payment_methods').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('categories').select('*').eq('tenant_id', user.tenant_id),
        supabase.from('suppliers').select('*').eq('tenant_id', user.tenant_id),
      ]);

      const errors = [
        clientsData.error, servicesData.error, productsData.error,
        barbersData.error, appointmentsData.error, salesData.error,
        saleItemsData.error, paymentsData.error, businessHoursData.error,
        paymentMethodsData.error, categoriesData.error, suppliersData.error
      ].filter(Boolean);

      if (errors.length > 0) {
        console.error('[Backup] Erros ao buscar dados:', errors);
        throw new Error('Erro ao buscar dados para backup');
      }

      const backupData: BackupData = {
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        tenant_id: user.tenant_id,
        data: {
          clients: clientsData.data || [],
          services: servicesData.data || [],
          products: productsData.data || [],
          barbers: barbersData.data || [],
          appointments: appointmentsData.data || [],
          sales: salesData.data || [],
          sale_items: saleItemsData.data || [],
          payments: paymentsData.data || [],
          business_hours: businessHoursData.data || [],
          payment_methods: paymentMethodsData.data || [],
          categories: categoriesData.data || [],
          suppliers: suppliersData.data || [],
        },
      };

      console.log('[Backup] Dados coletados. Categorias:', backupData.data.categories.length);
      return backupData;
    },
    onSuccess: async (data) => {
      try {
        const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss', { locale: ptBR });
        const fileName = `backup_barbearia_${timestamp}.json`;
        const jsonString = JSON.stringify(data, null, 2);

        if (Platform.OS === 'web') {
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          Alert.alert('Sucesso', 'Backup realizado com sucesso!');
        } else {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, jsonString);

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri);
            // Alert removido aqui porque o menu de partilha nativo do telemóvel já serve de confirmação
          } else {
            Alert.alert('Sucesso', `Backup salvo em: ${fileUri}`);
          }
        }
      } catch (error) {
        console.error('[Backup] Erro ao salvar arquivo:', error);
        Alert.alert('Erro', 'Não foi possível salvar o arquivo de backup');
      }
    },
    onError: (error: any) => {
      console.error('[Backup] Erro:', error);
      Alert.alert('Erro', 'Não foi possível realizar o backup');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (backupData: BackupData) => {
      if (!user?.tenant_id) throw new Error('Usuário não autenticado');
      if (backupData.tenant_id !== user.tenant_id) {
        throw new Error('Este backup pertence a outro estabelecimento');
      }

      console.log('[Restore] Iniciando restauração de dados...');

      // 1. Apagar dados antigos respeitando as dependências (Filhos primeiro)
      await supabase.from('payments').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('sale_items').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('sales').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('appointments').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('products').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('services').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('barbers').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('clients').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('categories').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('payment_methods').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('suppliers').delete().eq('tenant_id', user.tenant_id);
      await supabase.from('business_hours').delete().eq('tenant_id', user.tenant_id);

      console.log('[Restore] Inserindo dados base (Pais)...');
      
      // 2. Inserir tabelas base que não dependem de outras
      await Promise.allSettled([
        backupData.data.clients?.length ? supabase.from('clients').insert(backupData.data.clients) : Promise.resolve(),
        backupData.data.categories?.length ? supabase.from('categories').insert(backupData.data.categories) : Promise.resolve(),
        backupData.data.payment_methods?.length ? supabase.from('payment_methods').insert(backupData.data.payment_methods) : Promise.resolve(),
        backupData.data.suppliers?.length ? supabase.from('suppliers').insert(backupData.data.suppliers) : Promise.resolve(),
        backupData.data.business_hours?.length ? supabase.from('business_hours').insert(backupData.data.business_hours) : Promise.resolve(),
      ]);

      console.log('[Restore] Inserindo produtos e serviços...');

      // 3. Inserir tabelas que dependem das categorias
      await Promise.allSettled([
        backupData.data.services?.length ? supabase.from('services').insert(backupData.data.services) : Promise.resolve(),
        backupData.data.products?.length ? supabase.from('products').insert(backupData.data.products) : Promise.resolve(),
      ]);

      if (backupData.data.barbers?.length) {
        const barbersToInsert = backupData.data.barbers.map((barber) => ({
          id: barber.id,
          user_id: barber.user_id,
          tenant_id: barber.tenant_id,
          specialty: barber.specialty,
          commission_rate: barber.commission_rate,
          is_active: barber.is_active,
          created_at: barber.created_at,
          updated_at: barber.updated_at,
        }));
        await supabase.from('barbers').insert(barbersToInsert);
      }

      console.log('[Restore] Inserindo transações...');

      await Promise.allSettled([
        backupData.data.appointments?.length ? supabase.from('appointments').insert(backupData.data.appointments) : Promise.resolve(),
        backupData.data.sales?.length ? supabase.from('sales').insert(backupData.data.sales) : Promise.resolve(),
      ]);

      if (backupData.data.sale_items?.length) {
        await supabase.from('sale_items').insert(backupData.data.sale_items);
      }
      if (backupData.data.payments?.length) {
        await supabase.from('payments').insert(backupData.data.payments);
      }

      console.log('[Restore] Restauração concluída com sucesso!');
      return true;
    },
    onSuccess: () => {
      Alert.alert(
        'Sucesso',
        'Backup restaurado com sucesso! Os dados foram atualizados.',
        [{ text: 'OK', onPress: () => router.push('/(tabs)') }]
      );
    },
    onError: (error: any) => {
      console.error('[Restore] Erro:', error);
      Alert.alert('Erro', error.message || 'Não foi possível restaurar o backup');
    },
  });

  const handleBackup = () => {
    Alert.alert(
      'Fazer Backup',
      'Deseja fazer o backup de todos os dados? Isso pode levar alguns instantes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Fazer Backup', onPress: () => backupMutation.mutate() },
      ]
    );
  };

  const handleRestore = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = async (event: any) => {
              try {
                const backupData: BackupData = JSON.parse(event.target.result);
                restoreMutation.mutate(backupData);
              } catch (error) {
                Alert.alert('Erro', 'Arquivo de backup inválido');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          return;
        }

        const fileUri = result.assets[0].uri;
        const fileContent = await FileSystem.readAsStringAsync(fileUri);
        const backupData: BackupData = JSON.parse(fileContent);

        Alert.alert(
          'Confirmar Restauração',
          'ATENÇÃO: Isso irá substituir todos os dados atuais pelos dados do backup. Esta ação não pode ser desfeita. Deseja continuar?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Restaurar',
              style: 'destructive',
              onPress: () => restoreMutation.mutate(backupData),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('[Restore] Erro ao ler arquivo:', error);
      Alert.alert('Erro', 'Não foi possível ler o arquivo de backup');
    }
  };

  const handleLogout = async () => {
    try {
      setShowMenu(false);
      await signOut();
    } catch (error) {
      console.error('[Backup] Logout error:', error);
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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
              <Menu size={28} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Backup de Dados</Text>
              <Text style={styles.subtitle}>
                Faça backup e restaure seus dados com segurança
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.warningCard}>
            <AlertCircle size={24} color='#F59E0B' strokeWidth={2} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Importante</Text>
              <Text style={styles.warningText}>
                O backup inclui todos os dados do seu estabelecimento. 
                Guarde o arquivo em local seguro. A restauração substitui todos os dados atuais.
              </Text>
            </View>
          </View>

          {statsLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
          ) : (
            <>
              <View style={styles.statsCard}>
                <View style={styles.statsHeader}>
                  <HardDrive size={28} color={colors.primary} strokeWidth={2} />
                  <Text style={styles.statsTitle}>Dados Disponíveis para Backup</Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Users size={20} color='#10B981' strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.clients || 0}</Text>
                    <Text style={styles.statLabel}>Clientes</Text>
                  </View>

                  <View style={styles.statItem}>
                    <Scissors size={20} color={colors.secondary} strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.services || 0}</Text>
                    <Text style={styles.statLabel}>Serviços</Text>
                  </View>

                  <View style={styles.statItem}>
                    <Package size={20} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.products || 0}</Text>
                    <Text style={styles.statLabel}>Produtos</Text>
                  </View>

                  <View style={styles.statItem}>
                    <UserCircle size={20} color='#8B5CF6' strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.barbers || 0}</Text>
                    <Text style={styles.statLabel}>Barbeiros</Text>
                  </View>

                  <View style={styles.statItem}>
                    <Calendar size={20} color='#3B82F6' strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.appointments || 0}</Text>
                    <Text style={styles.statLabel}>Agendamentos</Text>
                  </View>

                  <View style={styles.statItem}>
                    <ShoppingCart size={20} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.statValue}>{backupStats?.sales || 0}</Text>
                    <Text style={styles.statLabel}>Vendas</Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.backupButton, backupMutation.isPending && styles.actionButtonDisabled]}
                  onPress={handleBackup}
                  disabled={backupMutation.isPending}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, styles.backupIcon]}>
                    {backupMutation.isPending ? (
                      <ActivityIndicator size="small" color='#F59E0B' />
                    ) : (
                      <Download size={28} color='#F59E0B' strokeWidth={2.5} />
                    )}
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>Fazer Backup</Text>
                    <Text style={styles.actionDescription}>
                      Exportar todos os dados para arquivo JSON
                    </Text>
                  </View>
                  <ChevronRight size={24} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.restoreButton, restoreMutation.isPending && styles.actionButtonDisabled]}
                  onPress={handleRestore}
                  disabled={restoreMutation.isPending}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, styles.restoreIcon]}>
                    {restoreMutation.isPending ? (
                      <ActivityIndicator size="small" color='#3B82F6' />
                    ) : (
                      <Upload size={28} color='#3B82F6' strokeWidth={2.5} />
                    )}
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>Restaurar Backup</Text>
                    <Text style={styles.actionDescription}>
                      Importar dados de um arquivo de backup
                    </Text>
                  </View>
                  <ChevronRight size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.infoCard}>
                <FileArchive size={24} color={colors.primary} strokeWidth={2} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoTitle}>Formato do Arquivo</Text>
                  <Text style={styles.infoText}>
                    • Formato: JSON{'\n'}
                    • Nome: backup_barbearia_[data_hora].json{'\n'}
                    • Contém: Todos os dados do estabelecimento{'\n'}
                    • Compatível: Apenas com este aplicativo
                  </Text>
                </View>
              </View>

              <View style={styles.tipsCard}>
                <CheckCircle size={24} color={colors.success} strokeWidth={2} />
                <View style={styles.tipsContent}>
                  <Text style={styles.tipsTitle}>Dicas de Segurança</Text>
                  <Text style={styles.tipsText}>
                    ✓ Faça backups regularmente (semanal ou diariamente){'\n'}
                    ✓ Guarde os arquivos em local seguro (nuvem, pendrive){'\n'}
                    ✓ Teste a restauração periodicamente{'\n'}
                    ✓ Mantenha múltiplas versões de backup{'\n'}
                    ✓ Não compartilhe arquivos de backup
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 999 },
  hamburgerMenu: { position: 'absolute', top: 0, left: 0, width: 300, height: '100%', backgroundColor: colors.surface, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 },
  menuHeader: { padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.background },
  menuUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  menuUserAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: `${colors.primary}15` as const, justifyContent: 'center', alignItems: 'center' },
  menuUserName: { fontSize: 18, fontWeight: '700', color: colors.text },
  menuUserRole: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  menuCloseButton: { position: 'absolute', top: 20, right: 20, padding: 4 },
  menuContent: { flex: 1, padding: 16 },
  menuSection: { marginBottom: 8 },
  menuSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, gap: 12, marginBottom: 4 },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  menuItemDanger: { backgroundColor: `${colors.error}10` },
  menuItemTextDanger: { color: colors.error },
  menuDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 16 },
  hamburgerButton: { padding: 8, marginRight: 8 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerContent: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  section: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  warningCard: { flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#FCD34D' },
  warningContent: { flex: 1 },
  warningTitle: { fontSize: 16, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  warningText: { fontSize: 14, color: '#92400E', lineHeight: 20 },
  statsCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.borderLight, shadowColor: colors.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
  statsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  statsTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: { width: '31%', backgroundColor: colors.background, borderRadius: 12, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 10, lineHeight: 14, color: colors.textSecondary, textAlign: 'center', includeFontPadding: false },
  actionsContainer: { gap: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.borderLight, shadowColor: colors.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
  backupButton: { borderColor: '#FCD34D' },
  restoreButton: { borderColor: '#93C5FD' },
  actionButtonDisabled: { opacity: 0.6 },
  actionIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  backupIcon: { backgroundColor: '#FEF3C7' },
  restoreIcon: { backgroundColor: '#DBEAFE' },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  actionDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 18 },
  infoCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.borderLight },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  infoText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  tipsCard: { flexDirection: 'row', backgroundColor: '#D1FAE5', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#6EE7B7' },
  tipsContent: { flex: 1 },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: '#065F46', marginBottom: 8 },
  tipsText: { fontSize: 14, color: '#065F46', lineHeight: 22 },
});