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
  Truck,
  Phone,
  Mail,
  X,
  Check,
  MapPin,
  Trash2,
} from 'lucide-react-native';

type Fornecedor = {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  cnpj?: string;
  produtos: string[];
  ativo: boolean;
};

export default function FornecedoresScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    endereco: '',
    cnpj: '',
    produtos: '',
  });

  // Busca os fornecedores na base de dados
  const { data: fornecedores = [], isLoading, refetch } = useQuery({
    queryKey: ['suppliers', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('name');

      if (error) throw error;

      return data.map((f: any) => ({
        id: f.id,
        nome: f.name,
        telefone: f.phone,
        email: f.email || '',
        endereco: f.address || '',
        cnpj: f.cnpj || '',
        produtos: f.products || [],
        ativo: f.is_active,
      })) as Fornecedor[];
    },
    enabled: !!user?.tenant_id,
  });

  const filteredFornecedores = fornecedores.filter((fornecedor) =>
    fornecedor.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fornecedor.telefone.includes(searchQuery)
  );

  const handleOpenModal = (fornecedor?: Fornecedor) => {
    if (fornecedor) {
      setEditingFornecedor(fornecedor);
      setFormData({
        nome: fornecedor.nome,
        telefone: fornecedor.telefone,
        email: fornecedor.email || '',
        endereco: fornecedor.endereco || '',
        cnpj: fornecedor.cnpj || '',
        produtos: fornecedor.produtos.join(', '),
      });
    } else {
      setEditingFornecedor(null);
      setFormData({ nome: '', telefone: '', email: '', endereco: '', cnpj: '', produtos: '' });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingFornecedor(null);
    setFormData({ nome: '', telefone: '', email: '', endereco: '', cnpj: '', produtos: '' });
  };

  const handleSave = async () => {
    if (!user?.tenant_id) return;
    
    if (!formData.nome.trim() || !formData.telefone.trim()) {
      Alert.alert('Erro', 'Nome e telefone são obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      const produtosArray = formData.produtos
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const { error } = await supabase
        .from('suppliers')
        .upsert({
          id: editingFornecedor ? editingFornecedor.id : undefined,
          tenant_id: user.tenant_id,
          name: formData.nome.trim(),
          phone: formData.telefone.trim(),
          email: formData.email.trim() || null,
          address: formData.endereco.trim() || null,
          cnpj: formData.cnpj.trim() || null,
          products: produtosArray,
          is_active: true,
        });

      if (error) throw error;

      await refetch();
      Alert.alert('Sucesso', 'Fornecedor salvo com sucesso!');
      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar fornecedor:', error);
      Alert.alert('Erro', 'Não foi possível salvar o fornecedor.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!editingFornecedor) return;
    
    Alert.alert(
      'Excluir Fornecedor',
      `Tem certeza que deseja excluir "${editingFornecedor.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive', 
          onPress: async () => {
            setIsSaving(true);
            try {
              const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('id', editingFornecedor.id);
                
              if (error) throw error;
              
              await refetch();
              Alert.alert('Sucesso', 'Fornecedor excluído!');
              handleCloseModal();
            } catch (error) {
              console.error('Erro ao excluir:', error);
              Alert.alert('Erro', 'Não foi possível excluir o fornecedor.');
            } finally {
              setIsSaving(false);
            }
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou telefone..."
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
      ) : filteredFornecedores.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Nenhum fornecedor encontrado.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.fornecedoresList}>
            {filteredFornecedores.map((fornecedor) => (
              <TouchableOpacity
                key={fornecedor.id}
                style={styles.fornecedorCard}
                onPress={() => handleOpenModal(fornecedor)}
                activeOpacity={0.7}
              >
                <View style={styles.fornecedorHeader}>
                  <View style={styles.fornecedorAvatar}>
                    <Truck size={24} color='#06B6D4' strokeWidth={2} />
                  </View>
                  <View style={styles.fornecedorInfo}>
                    <Text style={styles.fornecedorName}>{fornecedor.nome}</Text>
                    <View style={styles.fornecedorDetail}>
                      <Phone size={14} color={colors.textSecondary} />
                      <Text style={styles.fornecedorDetailText}>
                        {fornecedor.telefone}
                      </Text>
                    </View>
                    {fornecedor.email && (
                      <View style={styles.fornecedorDetail}>
                        <Mail size={14} color={colors.textSecondary} />
                        <Text style={styles.fornecedorDetailText}>
                          {fornecedor.email}
                        </Text>
                      </View>
                    )}
                    {fornecedor.endereco && (
                      <View style={styles.fornecedorDetail}>
                        <MapPin size={14} color={colors.textSecondary} />
                        <Text style={styles.fornecedorDetailText}>
                          {fornecedor.endereco}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {fornecedor.produtos && fornecedor.produtos.length > 0 && (
                  <View style={styles.produtosContainer}>
                    <Text style={styles.produtosLabel}>Produtos fornecidos:</Text>
                    <View style={styles.produtosTags}>
                      {fornecedor.produtos.map((produto, index) => (
                        <View key={index} style={styles.produtoTag}>
                          <Text style={styles.produtoTagText}>{produto}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
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
                {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
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
                  placeholder="Nome da empresa ou fornecedor"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.nome}
                  onChangeText={(text) =>
                    setFormData({ ...formData, nome: text })
                  }
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Telefone *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.telefone}
                  onChangeText={(text) =>
                    setFormData({ ...formData, telefone: text })
                  }
                  keyboardType="phone-pad"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CNPJ</Text>
                <TextInput
                  style={styles.input}
                  placeholder="00.000.000/0000-00"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.cnpj}
                  onChangeText={(text) =>
                    setFormData({ ...formData, cnpj: text })
                  }
                  keyboardType="number-pad"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-mail</Text>
                <TextInput
                  style={styles.input}
                  placeholder="contato@fornecedor.com"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.email}
                  onChangeText={(text) =>
                    setFormData({ ...formData, email: text })
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Endereço</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Rua, número, bairro"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.endereco}
                  onChangeText={(text) =>
                    setFormData({ ...formData, endereco: text })
                  }
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Produtos (separados por vírgula)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Shampoo, Lâminas, Toalhas..."
                  placeholderTextColor={colors.textSecondary}
                  value={formData.produtos}
                  onChangeText={(text) =>
                    setFormData({ ...formData, produtos: text })
                  }
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isSaving}
                />
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

              {/* Botão de Excluir aparece apenas se estivermos a editar */}
              {editingFornecedor && (
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 0, width: 48, borderColor: colors.error, backgroundColor: `${colors.error}10` }]}
                  onPress={confirmDelete}
                  activeOpacity={0.7}
                  disabled={isSaving}
                >
                  <Trash2 size={20} color={colors.error} />
                </TouchableOpacity>
              )}

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
  fornecedoresList: { padding: 16, gap: 12 },
  fornecedorCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  fornecedorHeader: { flexDirection: 'row', gap: 12 },
  fornecedorAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#06B6D415', justifyContent: 'center', alignItems: 'center' },
  fornecedorInfo: { flex: 1, gap: 6 },
  fornecedorName: { fontSize: 16, fontWeight: '600', color: colors.text },
  fornecedorDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fornecedorDetailText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  produtosContainer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 },
  produtosLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  produtosTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  produtoTag: { backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  produtoTagText: { fontSize: 13, color: colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  formContainer: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  textArea: { minHeight: 80 },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, height: 48, backgroundColor: colors.background, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { flex: 1, height: 48, backgroundColor: colors.primary, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
});