import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Sale, Client, Service, Product, PaymentMethod } from '@/types/database';
import colors from '@/constants/colors';
import { 
  DollarSign, 
  Calendar, 
  Receipt, 
  Plus, 
  X, 
  ShoppingCart, 
  Trash2, 
  Menu, 
  Home, 
  CalendarCheck, 
  Sparkles, 
  Users, 
  FileText, 
  FolderOpen, 
  UserCircle, 
  ChevronRight, 
  LogOut, 
  Scissors,
  Database
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type CartItem = {
  id: string;
  type: 'service' | 'product';
  name: string;
  price: number;
  quantity: number;
  serviceId?: string;
  productId?: string;
};

type PaymentEntry = {
  method: PaymentMethod;
  amount: number;
};

export default function VendasScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const [selectedMonth] = useState<Date>(new Date());
  const [showMenu, setShowMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const [showPdvModal, setShowPdvModal] = useState(false);
  const [searchClient, setSearchClient] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');

  const { data: sales, isLoading, refetch } = useQuery({
    queryKey: ['sales', user?.tenant_id, selectedMonth.toISOString()],
    queryFn: async () => {
      if (!user?.tenant_id) return [];

      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);

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
        .gte('sale_date', monthStart.toISOString())
        .lte('sale_date', monthEnd.toISOString())
        .order('sale_date', { ascending: false });

      if (error) {
        console.error('[Vendas] Error fetching sales:', error);
        throw error;
      }

      return data as Sale[];
    },
    enabled: !!user?.tenant_id,
  });

  const totalMonth = sales?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0;
  const totalSales = sales?.length || 0;

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

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: 'Dinheiro',
      credit_card: 'Cartão Crédito',
      debit_card: 'Cartão Débito',
      pix: 'PIX',
      other: 'Outro',
    };
    return labels[method] || method;
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

  const { data: products } = useQuery({
    queryKey: ['products', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .eq('is_active', true)
        .gt('stock_quantity', 0);
      
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user?.tenant_id,
  });

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      if (!user?.tenant_id || cart.length === 0) {
        throw new Error('Adicione itens ao carrinho');
      }

      const discountValue = Math.round((parseFloat(discount) || 0) * 100) / 100;
      const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
      const total = Math.round((subtotal - discountValue) * 100) / 100;
      
      const totalPaid = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
      if (Math.abs(totalPaid - total) > 0.01) {
        throw new Error(`O valor pago (R$ ${totalPaid.toFixed(2)}) deve ser igual ao total da venda (R$ ${total.toFixed(2)})`);
      }

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          tenant_id: user.tenant_id,
          client_id: selectedClient?.id || null,
          sale_date: new Date().toISOString(),
          subtotal,
          discount_amount: discountValue,
          total,
          created_by: user.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({
        tenant_id: user.tenant_id,
        sale_id: sale.id,
        service_id: item.serviceId || null,
        product_id: item.productId || null,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      const paymentEntries = payments.map(p => ({
        tenant_id: user.tenant_id,
        sale_id: sale.id,
        payment_method: p.method,
        amount: p.amount,
        payment_date: new Date().toISOString(),
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentEntries);

      if (paymentsError) throw paymentsError;

      // Atualizar estoque dos produtos
      for (const item of cart) {
        if (item.productId) {
          const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.productId)
            .single();

          if (fetchError) {
            console.error('Error fetching product stock:', fetchError);
            continue;
          }

          const newQuantity = (product.stock_quantity || 0) - item.quantity;
          const { error: stockError } = await supabase
            .from('products')
            .update({ stock_quantity: Math.max(0, newQuantity) })
            .eq('id', item.productId);

          if (stockError) {
            console.error('Stock update error:', stockError);
          }
        }
      }

      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      resetPdv();
      setShowPdvModal(false);
      Alert.alert('Sucesso', 'Venda registrada com sucesso!');
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message);
    },
  });

  const handleNewSale = () => {
    resetPdv();
    setShowPdvModal(true);
  };

  const resetPdv = () => {
    setSearchClient('');
    setSearchItem('');
    setSelectedClient(null);
    setCart([]);
    setDiscount('0');
    setPayments([]);
    setPaymentAmount('');
  };

  const addToCart = (item: Service | Product, type: 'service' | 'product') => {
    const cartItem: CartItem = {
      id: `${type}-${item.id}-${Date.now()}`,
      type,
      name: item.name,
      price: Number(item.price),
      quantity: 1,
      serviceId: type === 'service' ? item.id : undefined,
      productId: type === 'product' ? item.id : undefined,
    };
    setCart([...cart, cartItem]);
    setSearchItem('');
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setCart(cart.map(item => item.id === id ? { ...item, quantity } : item));
  };

  const addPayment = () => {
    const trimmedAmount = paymentAmount.trim();
    
    if (!trimmedAmount || trimmedAmount === '' || trimmedAmount === '0' || trimmedAmount === '0.00') {
      Alert.alert('Erro', 'Digite um valor válido maior que zero');
      return;
    }
    
    const amount = Math.round((parseFloat(trimmedAmount) || 0) * 100) / 100;
    
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Erro', 'Digite um valor válido maior que zero');
      return;
    }
    
    const newPayments = [...payments, { method: paymentMethod, amount }];
    setPayments(newPayments);
    setPaymentAmount('');
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  const discountValue = Math.round((parseFloat(discount) || 0) * 100) / 100;
  const total = Math.round((subtotal - discountValue) * 100) / 100;
  const totalPaid = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const remaining = Math.round((total - totalPaid) * 100) / 100;
  const canFinish = cart.length > 0 && Math.abs(remaining) <= 0.01;

  const filteredItems = searchItem.length >= 2
    ? [
        ...(services || []).filter(s => s.name.toLowerCase().includes(searchItem.toLowerCase())),
        ...(products || []).filter(p => p.name.toLowerCase().includes(searchItem.toLowerCase())),
      ]
    : [];

  useEffect(() => {
    if (params.autoOpen === 'true') {
      const loadAutomaticData = async () => {
        setShowPdvModal(true);

        if (params.serviceId) {
          const { data: serviceData } = await supabase
            .from('services')
            .select('*')
            .eq('id', params.serviceId)
            .single();

          if (serviceData) {
            addToCart(serviceData, 'service');
          }
        }

        if (params.clientId) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('*')
            .eq('id', params.clientId)
            .single();

          if (clientData) {
            setSelectedClient(clientData);
          }
        }

        router.setParams({ autoOpen: 'false', clientId: '', serviceId: '' });
      };

      loadAutomaticData();
    }
  }, [params.autoOpen]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {showMenu && (
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1}
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

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerButton}>
            <Menu size={28} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Vendas</Text>
            <Text style={styles.subtitle}>
              {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryCards}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <DollarSign size={20} color={colors.primary} strokeWidth={2.5} />
          </View>
          <Text style={styles.summaryValue}>R$ {totalMonth.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total do Mês</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={[styles.summaryIcon, styles.summaryIconSecondary]}>
            <Receipt size={20} color={colors.secondary} strokeWidth={2.5} />
          </View>
          <Text style={styles.summaryValue}>{totalSales}</Text>
          <Text style={styles.summaryLabel}>Vendas</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />
        }
      >
        {sales && sales.length > 0 ? (
          <View style={styles.salesList}>
            {sales.map((sale) => (
              <View key={sale.id} style={styles.saleCard}>
                <View style={styles.saleHeader}>
                  <View style={styles.saleHeaderLeft}>
                    <Text style={styles.saleDate}>
                      {format(new Date(sale.sale_date), "dd/MM 'às' HH:mm")}
                    </Text>
                    {sale.client && (
                      <Text style={styles.clientName}>{sale.client.name}</Text>
                    )}
                  </View>
                  <Text style={styles.saleTotal}>R$ {Number(sale.total).toFixed(2)}</Text>
                </View>

                {sale.items && sale.items.length > 0 && (
                  <View style={styles.saleItems}>
                    {sale.items.map((item) => (
                      <Text key={item.id} style={styles.itemText}>
                        - {item.quantity}x {item.item_name} R$ 
                        {Number(item.total_price).toFixed(2)}
                      </Text>
                    ))}
                  </View>
                )}

                {sale.payments && sale.payments.length > 0 && (
                  <View style={styles.payments}>
                    {sale.payments.map((payment) => (
                      <View key={payment.id} style={styles.paymentBadge}>
                        <Text style={styles.paymentText}>
                          {getPaymentMethodLabel(payment.payment_method)}: R$ {Number(payment.amount).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {sale.discount_amount > 0 && (
                  <Text style={styles.discount}>
                    Desconto: R$ {Number(sale.discount_amount).toFixed(2)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Receipt size={64} color={colors.textLight} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nenhuma venda registrada</Text>
            <Text style={styles.emptyText}>
              Não há vendas registradas neste mês
            </Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleNewSale}>
        <Plus size={28} color={colors.surface} strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal
        visible={showPdvModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nova Venda</Text>
            <TouchableOpacity onPress={() => setShowPdvModal(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <ScrollView 
              style={styles.modalContent}
              contentContainerStyle={styles.modalContentContainer}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cliente (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Buscar cliente por nome ou telefone"
                value={searchClient}
                onChangeText={setSearchClient}
              />
              {selectedClient ? (
                <View style={styles.selectedClient}>
                  <Text style={styles.selectedClientText}>{selectedClient.name}</Text>
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
              <Text style={styles.sectionTitle}>Adicionar Itens</Text>
              <TextInput
                style={styles.input}
                placeholder="Buscar serviço ou produto"
                value={searchItem}
                onChangeText={setSearchItem}
              />
              {filteredItems.length > 0 && (
                <View style={styles.searchResults}>
                  {filteredItems.map(item => (
                    <TouchableOpacity
                      key={`${('duration_minutes' in item) ? 'service' : 'product'}-${item.id}`}
                      style={styles.searchResultItem}
                      onPress={() => addToCart(
                        item,
                        'duration_minutes' in item ? 'service' : 'product'
                      )}
                    >
                      <View style={styles.itemInfo}>
                        <Text style={styles.searchResultText}>{item.name}</Text>
                        <Text style={styles.itemType}>
                          {'duration_minutes' in item ? 'Serviço' : 'Produto'}
                        </Text>
                      </View>
                      <Text style={styles.itemPrice}>R$ {Number(item.price).toFixed(2)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Carrinho</Text>
              {cart.length === 0 ? (
                <Text style={styles.emptyCart}>Nenhum item adicionado</Text>
              ) : (
                <View style={styles.cartList}>
                  {cart.map(item => (
                    <View key={item.id} style={styles.cartItem}>
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        <Text style={styles.cartItemType}>{item.type === 'service' ? 'Serviço' : 'Produto'}</Text>
                      </View>
                      <View style={styles.cartItemControls}>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Text style={styles.qtyButtonText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                        <Text style={styles.cartItemPrice}>R$ {(item.price * item.quantity).toFixed(2)}</Text>
                        <TouchableOpacity onPress={() => removeFromCart(item.id)}>
                          <Trash2 size={18} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Desconto</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={discount}
                onChangeText={setDiscount}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pagamentos</Text>
              
              <View style={styles.paymentForm}>
                <Text style={styles.paymentFormLabel}>Forma de Pagamento</Text>
                <View style={styles.paymentMethods}>
                  {(['cash', 'credit_card', 'debit_card', 'pix'] as PaymentMethod[]).map(method => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.paymentMethodButton,
                        paymentMethod === method && styles.paymentMethodButtonActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => setPaymentMethod(method)}
                    >
                      <Text
                        style={[
                          styles.paymentMethodButtonText,
                          paymentMethod === method && styles.paymentMethodButtonTextActive,
                        ]}
                      >
                        {getPaymentMethodLabel(method)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.paymentFormLabel}>Valor</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, fontSize: 16 }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textLight}
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  {remaining > 0 && (
                    <TouchableOpacity
                      style={[styles.addButton, { backgroundColor: colors.accent, paddingHorizontal: 12 }]}
                      onPress={() => setPaymentAmount(remaining.toFixed(2))}
                    >
                      <Text style={styles.addButtonText}>R$ {remaining.toFixed(2)}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.addButton, { paddingHorizontal: 20 }]}
                    activeOpacity={0.7}
                    onPress={addPayment}
                  >
                    <Plus size={18} color={colors.surface} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>

              {payments.length === 0 ? (
                <Text style={styles.emptyCart}>Nenhum pagamento adicionado ainda</Text>
              ) : (
                <View style={styles.paymentsList}>
                  {payments.map((payment, index) => (
                    <View key={index} style={styles.paymentItem}>
                      <Text style={styles.paymentMethod}>{getPaymentMethodLabel(payment.method)}</Text>
                      <Text style={styles.paymentAmount}>R$ {payment.amount.toFixed(2)}</Text>
                      <TouchableOpacity onPress={() => removePayment(index)}>
                        <Trash2 size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal:</Text>
                <Text style={styles.totalValue}>R$ {subtotal.toFixed(2)}</Text>
              </View>
              {discountValue > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Desconto:</Text>
                  <Text style={[styles.totalValue, styles.discountText]}>R$ {discountValue.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabelBold}>Total:</Text>
                <Text style={styles.totalValueBold}>R$ {total.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pago:</Text>
                <Text style={styles.totalValue}>R$ {totalPaid.toFixed(2)}</Text>
              </View>
              {remaining !== 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{remaining > 0 ? 'Faltam:' : 'Troco:'}:</Text>
                  <Text style={[styles.totalValue, remaining > 0 ? styles.remainingText : styles.changeText]}>
                    R$ {Math.abs(remaining).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.finishButton, (!canFinish || createSaleMutation.isPending) && styles.finishButtonDisabled]}
              activeOpacity={0.7}
              onPress={() => {
                if (createSaleMutation.isPending) return;
                if (cart.length === 0) {
                  Alert.alert('Atenção', 'Adicione itens ao carrinho antes de finalizar a venda');
                  return;
                }
                if (Math.abs(remaining) > 0.01) {
                  const message = remaining > 0 
                    ? `Faltam R$ ${remaining.toFixed(2)} para completar o pagamento`
                    : `Há R$ ${Math.abs(remaining).toFixed(2)} de troco a devolver`;
                  Alert.alert('Atenção', message);
                  return;
                }
                createSaleMutation.mutate();
              }}
            >
              {createSaleMutation.isPending ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={[styles.finishButtonText, (!canFinish || createSaleMutation.isPending) && styles.finishButtonTextDisabled]}>
                  {canFinish ? 'Finalizar Venda' : cart.length === 0 ? 'Adicione itens' : 'Complete o pagamento'}
                </Text>
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
    marginBottom: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 4,
  },
  summaryCards: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${colors.primary}15` as const,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryIconSecondary: {
    backgroundColor: `${colors.secondary}15` as const,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  salesList: {
    padding: 16,
    gap: 12,
  },
  saleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  saleHeaderLeft: {
    flex: 1,
  },
  saleDate: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  saleTotal: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  saleItems: {
    gap: 4,
    marginBottom: 8,
  },
  itemText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  payments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  paymentBadge: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500' as const,
  },
  discount: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
    fontStyle: 'italic' as const,
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
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.secondary,
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
  modalContentContainer: {
    paddingBottom: 20,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  selectedClient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  selectedClientText: {
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  itemInfo: {
    flex: 1,
  },
  itemType: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  emptyCart: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
  cartList: {
    gap: 8,
  },
  cartItem: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cartItemInfo: {
    marginBottom: 8,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  cartItemType: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cartItemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  cartItemPrice: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.primary,
    flex: 1,
    textAlign: 'right',
    marginRight: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.surface,
  },
  paymentsList: {
    gap: 8,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethod: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    flex: 1,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.primary,
    marginRight: 8,
  },
  totalsCard: {
    margin: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  totalLabelBold: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
  },
  totalValueBold: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  discountText: {
    color: colors.error,
  },
  remainingText: {
    color: colors.error,
  },
  changeText: {
    color: colors.success,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  finishButton: {
    backgroundColor: colors.success,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  finishButtonDisabled: {
    backgroundColor: colors.borderLight,
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.surface,
  },
  finishButtonTextDisabled: {
    color: colors.textSecondary,
  },
  paymentForm: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  paymentFormLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 8,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  paymentMethodButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paymentMethodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  paymentMethodButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  paymentMethodButtonTextActive: {
    color: colors.surface,
    fontWeight: '700' as const,
  },
});