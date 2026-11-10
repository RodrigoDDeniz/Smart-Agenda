import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import {
  Plus,
  Search,
  Package,
  DollarSign,
  AlertCircle,
  X,
  Check,
  Trash2,
} from 'lucide-react-native';

type Produto = {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
  estoqueMinimo: number;
  category_id?: string;
  categoria_nome?: string;
  categoria_cor?: string;
  ativo: boolean;
};

export default function ProdutosScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    preco: '',
    estoque: '',
    estoqueMinimo: '',
    category_id: '',
  });

  // 1. Busca as Categorias (Apenas do tipo 'produto')
  const { data: categorias = [] } = useQuery({
    queryKey: ['categories-produto', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, color')
        .eq('tenant_id', user.tenant_id)
        .eq('type', 'produto')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.tenant_id,
  });

  // 2. Busca os Produtos já com a relação da Categoria
  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ['products', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(id, name, color)')
        .eq('tenant_id', user.tenant_id)
        .order('name', { ascending: true });

      if (error) throw error;
      
      return data.map((p: any) => ({
        id: p.id,
        nome: p.name,
        preco: Number(p.price),
        estoque: p.stock_quantity,
        estoqueMinimo: p.low_stock_alert || 0,
        category_id: p.category_id || '',
        categoria_nome: p.categories?.name || '',
        categoria_cor: p.categories?.color || colors.primary,
        ativo: p.is_active,
      })) as Produto[];
    },
    enabled: !!user?.tenant_id,
  });

  // 3. Filtra os produtos com proteção
  const filteredProdutos = produtos.filter((produto) => {
    const nomeSeguro = produto.nome || '';
    const categoriaSegura = produto.categoria_nome || '';
    const buscaSegura = searchQuery.toLowerCase();

    return (
      nomeSeguro.toLowerCase().includes(buscaSegura) ||
      categoriaSegura.toLowerCase().includes(buscaSegura)
    );
  });

  // 4. Salva na base de dados
  const saveProdutoMutation = useMutation({
    mutationFn: async () => {
      if (
        !formData.nome ||
        !formData.preco ||
        !formData.estoque ||
        !formData.estoqueMinimo
      ) {
        throw new Error('Nome, preço, estoque e estoque mínimo são obrigatórios');
      }

      const productData = {
        tenant_id: user?.tenant_id,
        name: formData.nome,
        price: parseFloat(formData.preco.replace(',', '.')),
        stock_quantity: parseInt(formData.estoque, 10),
        low_stock_alert: parseInt(formData.estoqueMinimo, 10),
        category_id: formData.category_id || null,
        is_active: true,
      };

      if (editingProduto) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] }); // Atualiza a contagem nas categorias!
      Alert.alert('Sucesso', 'Produto salvo com sucesso!');
      handleCloseModal();
    },
    onError: (error: Error) => {
      Alert.alert('Erro ao salvar', error.message);
    }
  });

  // 5. Exclui da base de dados
  const deleteProdutoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      Alert.alert('Sucesso', 'Produto excluído!');
      handleCloseModal();
    },
    onError: (error: Error) => {
      Alert.alert('Erro ao excluir', error.message);
    }
  });

  const confirmDelete = () => {
    if (!editingProduto) return;
    
    Alert.alert(
      'Excluir Produto',
      `Tem certeza que deseja excluir "${editingProduto.nome}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive', 
          onPress: () => deleteProdutoMutation.mutate(editingProduto.id) 
        }
      ]
    );
  };

  const handleOpenModal = (produto?: Produto) => {
    if (produto) {
      setEditingProduto(produto);
      setFormData({
        nome: produto.nome,
        preco: produto.preco.toString(),
        estoque: produto.estoque.toString(),
        estoqueMinimo: produto.estoqueMinimo.toString(),
        category_id: produto.category_id || '',
      });
    } else {
      setEditingProduto(null);
      setFormData({
        nome: '',
        preco: '',
        estoque: '',
        estoqueMinimo: '',
        category_id: '',
      });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingProduto(null);
    setFormData({
      nome: '',
      preco: '',
      estoque: '',
      estoqueMinimo: '',
      category_id: '',
    });
  };

  const handleSave = () => {
    saveProdutoMutation.mutate();
  };

  return (
    <View style={styles.container}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Search size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar produtos..."
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

        <ScrollView style={styles.scrollView}>
          <View style={styles.produtosList}>
            {filteredProdutos.map((produto) => {
              const isLowStock = produto.estoque <= produto.estoqueMinimo;
              return (
                <TouchableOpacity
                  key={produto.id}
                  style={styles.produtoCard}
                  onPress={() => handleOpenModal(produto)}
                  activeOpacity={0.7}
                >
                  <View style={styles.produtoHeader}>
                    <View style={[styles.produtoIcon, { backgroundColor: `${produto.categoria_cor || colors.accent}15` }]}>
                      <Package
                        size={24}
                        color={produto.categoria_cor || colors.accent}
                        strokeWidth={2}
                      />
                    </View>
                    <View style={styles.produtoInfo}>
                      <Text style={styles.produtoName}>{produto.nome}</Text>
                      {produto.categoria_nome ? (
                        <Text style={[styles.produtoCategory, { color: produto.categoria_cor }]}>
                          • {produto.categoria_nome}
                        </Text>
                      ) : null}
                    </View>
                    {isLowStock && (
                      <View style={styles.lowStockBadge}>
                        <AlertCircle size={16} color={colors.error} />
                      </View>
                    )}
                  </View>
                  <View style={styles.produtoDetails}>
                    <View style={styles.detailItem}>
                      <DollarSign
                        size={16}
                        color={colors.success}
                        strokeWidth={2}
                      />
                      <Text style={styles.detailValue}>
                        R$ {produto.preco.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailItem}>
                      <Package size={16} color={colors.primary} strokeWidth={2} />
                      <Text
                        style={[
                          styles.detailValue,
                          isLowStock && { color: colors.error },
                        ]}
                      >
                        Estoque: {produto.estoque}
                      </Text>
                    </View>
                  </View>
                  {isLowStock && (
                    <View style={styles.lowStockWarning}>
                      <Text style={styles.lowStockText}>
                        Estoque baixo! Mínimo: {produto.estoqueMinimo}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={handleCloseModal}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { paddingBottom: insets.bottom + 20 },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingProduto ? 'Editar Produto' : 'Novo Produto'}
                </Text>
                <TouchableOpacity
                  onPress={handleCloseModal}
                  style={styles.closeButton}
                >
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formContainer}>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Categoria</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                    {categorias.map((cat: any) => {
                      const isSelected = formData.category_id === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.categoryChip,
                            isSelected && { backgroundColor: cat.color, borderColor: cat.color }
                          ]}
                          onPress={() => setFormData({ ...formData, category_id: isSelected ? '' : cat.id })}
                        >
                          <Text style={[
                            styles.categoryChipText,
                            isSelected && { color: colors.surface }
                          ]}>
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome do produto"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.nome}
                    onChangeText={(text) =>
                      setFormData({ ...formData, nome: text })
                    }
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Preço (R$) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                      value={formData.preco}
                      onChangeText={(text) =>
                        setFormData({ ...formData, preco: text })
                      }
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Estoque *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      value={formData.estoque}
                      onChangeText={(text) =>
                        setFormData({ ...formData, estoque: text })
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Estoque Mín. *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      value={formData.estoqueMinimo}
                      onChangeText={(text) =>
                        setFormData({ ...formData, estoqueMinimo: text })
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCloseModal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                {editingProduto && (
                  <TouchableOpacity
                    style={[styles.cancelButton, { flex: 0, width: 48, borderColor: colors.error, backgroundColor: `${colors.error}10` }]}
                    onPress={confirmDelete}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={20} color={colors.error} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.7}
                >
                  <Check size={20} color={colors.surface} strokeWidth={2.5} />
                  <Text style={styles.saveButtonText}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, height: 48, gap: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  addButton: { width: 48, height: 48, backgroundColor: colors.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  produtosList: { padding: 16, gap: 12 },
  produtoCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  produtoHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  produtoIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  produtoInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  produtoName: { fontSize: 16, fontWeight: '600', color: colors.text },
  produtoCategory: { fontSize: 13, fontWeight: '500' },
  lowStockBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.error}15`, justifyContent: 'center', alignItems: 'center' },
  produtoDetails: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  detailItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  detailValue: { fontSize: 16, fontWeight: '600', color: colors.text },
  detailDivider: { width: 1, backgroundColor: colors.border },
  lowStockWarning: { backgroundColor: `${colors.error}10`, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.error },
  lowStockText: { fontSize: 13, color: colors.error, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  formContainer: { padding: 20 },
  categoryScroll: { gap: 8, paddingBottom: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  categoryChipText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  inputGroup: { marginBottom: 20 },
  inputRow: { flexDirection: 'row', gap: 12 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, height: 48, backgroundColor: colors.background, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { flex: 1, height: 48, backgroundColor: colors.primary, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
});