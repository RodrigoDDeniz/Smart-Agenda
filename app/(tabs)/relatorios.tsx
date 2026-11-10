import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Client, Service, Product, Sale } from '@/types/database';
import colors from '@/constants/colors';
import { Download, Calendar, Filter, Menu, Home, BarChart3, CalendarCheck, Sparkles, Users as UsersIcon, ShoppingCart, FileText, FolderOpen, UserCircle, LogOut, ChevronRight, X, Scissors } from 'lucide-react-native';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type ReportType = 'clientes' | 'servicos' | 'produtos' | 'vendas' | 'completo';
type PeriodType = 'semanal' | 'mensal' | 'semestral' | 'anual' | 'custom';
type FormatType = 'csv' | 'json';

export default function RelatoriosScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [selectedReport, setSelectedReport] = useState<ReportType>('completo');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('mensal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'semanal':
        return { start: startOfWeek(now, { locale: ptBR, weekStartsOn: 0 }), end: endOfWeek(now, { locale: ptBR, weekStartsOn: 0 }) };
      case 'mensal':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'semestral':
        return { start: subMonths(startOfMonth(now), 5), end: endOfMonth(now) };
      case 'anual':
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ['clients', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user?.tenant_id && (selectedReport === 'clientes' || selectedReport === 'completo'),
  });

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['services', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('name');
      if (error) throw error;
      return data as Service[];
    },
    enabled: !!user?.tenant_id && (selectedReport === 'servicos' || selectedReport === 'completo'),
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('name');
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user?.tenant_id && (selectedReport === 'produtos' || selectedReport === 'completo'),
  });

  const { data: sales, isLoading: loadingSales } = useQuery({
    queryKey: ['sales-report', user?.tenant_id, selectedPeriod],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      const { start, end } = getDateRange();
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          client:clients(name, phone),
          items:sale_items(
            id,
            item_name,
            quantity,
            total_price,
            service:services(name),
            product:products(name)
          ),
          payments(
            id,
            payment_method,
            amount
          )
        `)
        .eq('tenant_id', user.tenant_id)
        .gte('sale_date', start.toISOString())
        .lte('sale_date', end.toISOString())
        .order('sale_date', { ascending: false });
      if (error) throw error;
      return data as Sale[];
    },
    enabled: !!user?.tenant_id && (selectedReport === 'vendas' || selectedReport === 'completo'),
  });

  const isLoading = loadingClients || loadingServices || loadingProducts || loadingSales;

  const removeAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  const escapeCSVValue = (value: string): string => {
    const cleanValue = removeAccents(value);
    if (cleanValue.includes(',') || cleanValue.includes('"') || cleanValue.includes('\n')) {
      return `"${cleanValue.replace(/"/g, '""')}"`;
    }
    return cleanValue;
  };

  const convertToCSV = (data: any[], type: string): string => {
    if (!data || data.length === 0) return '';

    let headers: string[] = [];
    let rows: string[][] = [];

    switch (type) {
      case 'clientes':
        headers = ['ID', 'Nome', 'Telefone', 'Email', 'Data Nascimento', 'VIP', 'Criado em'];
        rows = (data as Client[]).map(c => [
          c.id,
          c.name,
          c.phone || '',
          c.email || '',
          c.birth_date || '',
          c.is_vip ? 'Sim' : 'Nao',
          format(new Date(c.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        ]);
        break;

      case 'servicos':
        headers = ['ID', 'Nome', 'Descricao', 'Preco', 'Duracao (min)', 'Ativo', 'Criado em'];
        rows = (data as Service[]).map(s => [
          s.id,
          s.name,
          s.description || '',
          `R$ ${Number(s.price).toFixed(2)}`,
          s.duration_minutes.toString(),
          s.is_active ? 'Sim' : 'Nao',
          format(new Date(s.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        ]);
        break;

      case 'produtos':
        headers = ['ID', 'Nome', 'SKU', 'Categoria', 'Preco', 'Custo', 'Estoque', 'Ativo', 'Criado em'];
        rows = (data as Product[]).map(p => [
          p.id,
          p.name,
          p.sku || '',
          p.category || '',
          `R$ ${Number(p.price).toFixed(2)}`,
          `R$ ${Number(p.cost || 0).toFixed(2)}`,
          p.stock_quantity.toString(),
          p.is_active ? 'Sim' : 'Nao',
          format(new Date(p.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        ]);
        break;

      case 'vendas':
        headers = ['ID', 'Cliente', 'Data', 'Subtotal', 'Desconto', 'Total', 'Formas de Pagamento'];
        rows = (data as Sale[]).map(s => [
          s.id,
          s.client?.name || 'Sem cliente',
          format(new Date(s.sale_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
          `R$ ${Number(s.subtotal).toFixed(2)}`,
          `R$ ${Number(s.discount_amount).toFixed(2)}`,
          `R$ ${Number(s.total).toFixed(2)}`,
          s.payments?.map(p => p.payment_method).join(', ') || '',
        ]);
        break;
    }

    const escapedHeaders = headers.map(escapeCSVValue);
    const escapedRows = rows.map(row => row.map(cell => escapeCSVValue(String(cell))));
    
    const csvContent = [
      escapedHeaders.join(','),
      ...escapedRows.map(row => row.join(',')),
    ].join('\n');

    return csvContent;
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

  const generateReport = async (formatType: FormatType) => {
    setIsGenerating(true);
    try {
      let reportData: any = {};
      const { start, end } = getDateRange();
      const periodLabel = `${format(start, 'dd-MM-yyyy', { locale: ptBR })}_${format(end, 'dd-MM-yyyy', { locale: ptBR })}`;

      if (selectedReport === 'completo') {
        reportData = {
          clientes: clients || [],
          servicos: services || [],
          produtos: products || [],
          vendas: sales || [],
        };
      } else if (selectedReport === 'clientes') {
        reportData = clients || [];
      } else if (selectedReport === 'servicos') {
        reportData = services || [];
      } else if (selectedReport === 'produtos') {
        reportData = products || [];
      } else if (selectedReport === 'vendas') {
        reportData = sales || [];
      }

      if (formatType === 'csv') {
        let csvContent = '';
        
        if (selectedReport === 'completo') {
          csvContent += '===== CLIENTES =====\n';
          csvContent += convertToCSV(reportData.clientes, 'clientes');
          csvContent += '\n\n===== SERVICOS =====\n';
          csvContent += convertToCSV(reportData.servicos, 'servicos');
          csvContent += '\n\n===== PRODUTOS =====\n';
          csvContent += convertToCSV(reportData.produtos, 'produtos');
          csvContent += '\n\n===== VENDAS =====\n';
          csvContent += convertToCSV(reportData.vendas, 'vendas');
        } else {
          csvContent = convertToCSV(reportData, selectedReport);
        }

        const fileName = `relatorio_${selectedReport}_${periodLabel}.csv`;

        if (Platform.OS === 'web') {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', fileName);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          Alert.alert('Sucesso', 'Relatório CSV gerado com sucesso!');
        } else {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'text/csv',
              dialogTitle: 'Compartilhar Relatório CSV',
            });
          } else {
            Alert.alert('Sucesso', `Relatório salvo em: ${fileUri}`);
          }
        }
      } else if (formatType === 'json') {
        const jsonContent = JSON.stringify(reportData, null, 2);
        const fileName = `relatorio_${selectedReport}_${periodLabel}.json`;

        if (Platform.OS === 'web') {
          const blob = new Blob([jsonContent], { type: 'application/json' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', fileName);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          Alert.alert('Sucesso', 'Relatório JSON gerado com sucesso!');
        } else {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, jsonContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Compartilhar Relatório JSON',
            });
          } else {
            Alert.alert('Sucesso', `Relatório salvo em: ${fileUri}`);
          }
        }
      }
    } catch (error) {
      console.error('[Relatórios] Error generating report:', error);
      Alert.alert('Erro', 'Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const reportTypes: { id: ReportType; label: string }[] = [
    { id: 'completo', label: 'Completo' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'vendas', label: 'Vendas' },
  ];

  const periodTypes: { id: PeriodType; label: string }[] = [
    { id: 'semanal', label: 'Semanal' },
    { id: 'mensal', label: 'Mensal' },
    { id: 'semestral', label: 'Semestral' },
    { id: 'anual', label: 'Anual' },
  ];

  const getReportStats = () => {
    const stats = {
      clientes: clients?.length || 0,
      servicos: services?.length || 0,
      produtos: products?.length || 0,
      vendas: sales?.length || 0,
      totalVendas: sales?.reduce((sum, s) => sum + Number(s.total), 0) || 0,
    };
    return stats;
  };

  const stats = getReportStats();
  const { start, end } = getDateRange();

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
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/clientes/gerenciar')}>
              <UsersIcon size={22} color='#10B981' strokeWidth={2} />
              <Text style={styles.menuItemText}>Gerenciar Clientes</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/servicos/gerenciar')}>
              <Scissors size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Gerenciar Serviços</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Navegação</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/agenda')}>
              <Calendar size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Agenda</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/vendas')}>
              <ShoppingCart size={22} color={colors.secondary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Vendas</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/relatorios')}>
              <FileText size={22} color={colors.accent} strokeWidth={2} />
              <Text style={styles.menuItemText}>Relatórios</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigateAndCloseMenu('/cadastros')}>
              <FolderOpen size={22} color={colors.primary} strokeWidth={2} />
              <Text style={styles.menuItemText}>Cadastros</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.menuDivider} />

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Conta</Text>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={() => navigateAndCloseMenu('logout')}>
              <LogOut size={22} color={colors.error} strokeWidth={2} />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Sair</Text>
              <ChevronRight size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
            <Menu size={28} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.title}>Relatórios</Text>
        </View>
        <Text style={styles.subtitle}>
          {format(start, 'dd/MM/yyyy', { locale: ptBR })} - {format(end, 'dd/MM/yyyy', { locale: ptBR })}
        </Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Filter size={18} color={colors.text} />
            <Text style={styles.sectionTitle}>Tipo de Relatório</Text>
          </View>
          <View style={styles.buttonGrid}>
            {reportTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.filterButton,
                  selectedReport === type.id && styles.filterButtonActive,
                ]}
                onPress={() => setSelectedReport(type.id)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedReport === type.id && styles.filterButtonTextActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={18} color={colors.text} />
            <Text style={styles.sectionTitle}>Período</Text>
          </View>
          <View style={styles.buttonGrid}>
            {periodTypes.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.filterButton,
                  selectedPeriod === period.id && styles.filterButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period.id)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedPeriod === period.id && styles.filterButtonTextActive,
                  ]}
                >
                  {period.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>Resumo dos Dados</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.clientes}</Text>
              <Text style={styles.statLabel}>Clientes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.servicos}</Text>
              <Text style={styles.statLabel}>Serviços</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.produtos}</Text>
              <Text style={styles.statLabel}>Produtos</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.vendas}</Text>
              <Text style={styles.statLabel}>Vendas</Text>
            </View>
            {selectedReport === 'vendas' || selectedReport === 'completo' ? (
              <View style={[styles.statCard, styles.statCardWide]}>
                <Text style={[styles.statValue, styles.statValuePrimary]}>
                  R$ {stats.totalVendas.toFixed(2)}
                </Text>
                <Text style={styles.statLabel}>Total de Vendas</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Formatos de Exportação</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportButton, styles.exportButtonCSV]}
              onPress={() => generateReport('csv')}
              disabled={isLoading || isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <>
                  <Download size={20} color={colors.surface} />
                  <Text style={styles.exportButtonText}>CSV</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportButton, styles.exportButtonJSON]}
              onPress={() => generateReport('json')}
              disabled={isLoading || isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <>
                  <Download size={20} color={colors.surface} />
                  <Text style={styles.exportButtonText}>JSON</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        )}
      </ScrollView>
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
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  filterButtonTextActive: {
    color: colors.surface,
  },
  statsSection: {
    padding: 20,
    paddingTop: 0,
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statCardWide: {
    minWidth: '100%',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  statValuePrimary: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 10,
    lineHeight: 14,           // >= fontSize
    color: colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false // reduz padding extra no Android
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exportButtonCSV: {
    backgroundColor: colors.secondary,
  },
  exportButtonJSON: {
    backgroundColor: colors.primary,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.surface,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
