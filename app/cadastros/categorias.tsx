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
  ActivityIndicator,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import colors from '@/constants/colors';
import {
  Plus,
  Search,
  Tags,
  X,
  Check,
  Package,
  Scissors,
} from 'lucide-react-native';

type Categoria = {
  id: string;
  nome: string;
  tipo: 'produto' | 'servico';
  cor: string;
  totalItens: number;
};

export default function CategoriasScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'produto' as Categoria['tipo'],
    cor: '#3B82F6',
  });

  const cores = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', 
    '#EC4899', '#06B6D4', '#EF4444', '#14B8A6'
  ];

  // Busca as categorias na base de dados
  // Busca as categorias na base de dados com a contagem de itens
  const { data: categorias = [], isLoading, refetch } = useQuery({
    queryKey: ['categories', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('categories')
        .select('*, products(id), services(id)')
        .eq('tenant_id', user.tenant_id)
        .order('name');

      if (error) throw error;

      return data.map(c => {
        // Conta quantos produtos e serviços estão ligados a esta categoria
        const totalProdutos = c.products ? c.products.length : 0;
        const totalServicos = c.services ? c.services.length : 0;

        return {
          id: c.id,
          nome: c.name,
          tipo: c.type as Categoria['tipo'],
          cor: c.color,
          totalItens: c.type === 'produto' ? totalProdutos : totalServicos,
        };
      });
    },
    enabled: !!user?.tenant_id,
  });

  const filteredCategorias = categorias.filter((categoria) =>
    categoria.nome.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenModal = (categoria?: Categoria) => {
    if (categoria) {
      setEditingCategoria(categoria);
      setFormData({
        nome: categoria.nome,
        tipo: categoria.tipo,
        cor: categoria.cor,
      });
    } else {
      setEditingCategoria(null);
      setFormData({ nome: '', tipo: 'produto', cor: '#3B82F6' });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCategoria(null);
    setFormData({ nome: '', tipo: 'produto', cor: '#3B82F6' });
  };

  const handleSave = async () => {
    if (!user?.tenant_id) return;

    if (!formData.nome.trim()) {
      Alert.alert('Erro', 'O nome da categoria é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('categories')
        .upsert({
          id: editingCategoria ? editingCategoria.id : undefined,
          tenant_id: user.tenant_id,
          name: formData.nome.trim(),
          type: formData.tipo,
          color: formData.cor,
        });

      if (error) throw error;

      await refetch();
      Alert.alert('Sucesso', 'Categoria salva com sucesso!');
      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
      Alert.alert('Erro', 'Não foi possível salvar a categoria.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar categorias..."
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredCategorias.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Nenhuma categoria encontrada.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.categoriasList}>
            {filteredCategorias.map((categoria) => (
              <TouchableOpacity
                key={categoria.id}
                style={styles.categoriaCard}
                onPress={() => handleOpenModal(categoria)}
                activeOpacity={0.7}
              >
                <View style={styles.categoriaHeader}>
                  <View style={[styles.categoriaIcon, { backgroundColor: `${categoria.cor}15` }]}>
                    {categoria.tipo === 'produto' ? (
                      <Package size={24} color={categoria.cor} strokeWidth={2} />
                    ) : (
                      <Scissors size={24} color={categoria.cor} strokeWidth={2} />
                    )}
                  </View>
                  <View style={styles.categoriaInfo}>
                    <Text style={styles.categoriaNome}>{categoria.nome}</Text>
                    <View style={styles.categoriaDetail}>
                      <Tags size={14} color={colors.textSecondary} />
                      <Text style={styles.categoriaDetailText}>
                        {categoria.tipo === 'produto' ? 'Produto' : 'Serviço'} • {categoria.totalItens} itens
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.colorDot, { backgroundColor: categoria.cor }]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

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
                {editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.closeButton}
                disabled={isSaving}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Finalizadores, Cortes..."
                  placeholderTextColor={colors.textSecondary}
                  value={formData.nome}
                  onChangeText={(text) =>
                    setFormData({ ...formData, nome: text })
                  }
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tipo *</Text>
                <View style={styles.tipoButtons}>
                  <TouchableOpacity
                    style={[
                      styles.tipoButton,
                      formData.tipo === 'produto' && styles.tipoButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, tipo: 'produto' })}
                    activeOpacity={0.7}
                    disabled={isSaving}
                  >
                    <Package size={20} color={formData.tipo === 'produto' ? colors.surface : colors.text} strokeWidth={2} />
                    <Text style={[
                      styles.tipoButtonText,
                      formData.tipo === 'produto' && styles.tipoButtonTextActive,
                    ]}>
                      Produto
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tipoButton,
                      formData.tipo === 'servico' && styles.tipoButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, tipo: 'servico' })}
                    activeOpacity={0.7}
                    disabled={isSaving}
                  >
                    <Scissors size={20} color={formData.tipo === 'servico' ? colors.surface : colors.text} strokeWidth={2} />
                    <Text style={[
                      styles.tipoButtonText,
                      formData.tipo === 'servico' && styles.tipoButtonTextActive,
                    ]}>
                      Serviço
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cor</Text>
                <View style={styles.colorPicker}>
                  {cores.map((cor) => (
                    <TouchableOpacity
                      key={cor}
                      style={[
                        styles.colorOption,
                        { backgroundColor: cor },
                        formData.cor === cor && styles.colorOptionSelected,
                      ]}
                      onPress={() => setFormData({ ...formData, cor })}
                      activeOpacity={0.7}
                      disabled={isSaving}
                    >
                      {formData.cor === cor && (
                        <Check size={20} color={colors.surface} strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCloseModal}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                {isSaving ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, height: 48, gap: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  addButton: { width: 48, height: 48, backgroundColor: colors.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  scrollView: { flex: 1 },
  categoriasList: { padding: 16, gap: 12 },
  categoriaCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  categoriaHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  categoriaIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  categoriaInfo: { flex: 1, gap: 6 },
  categoriaNome: { fontSize: 16, fontWeight: '600', color: colors.text },
  categoriaDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoriaDetailText: { fontSize: 14, color: colors.textSecondary },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.surface },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  formContainer: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  tipoButtons: { flexDirection: 'row', gap: 12 },
  tipoButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  tipoButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  tipoButtonTextActive: { color: colors.surface },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorOption: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  colorOptionSelected: { borderWidth: 3, borderColor: colors.surface },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, height: 48, backgroundColor: colors.background, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { flex: 1, height: 48, backgroundColor: colors.primary, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
});