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
  Switch,
  ActivityIndicator,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import colors from '@/constants/colors';
import {
  Plus,
  CreditCard,
  X,
  Check,
  Banknote,
  Smartphone,
  Percent,
} from 'lucide-react-native';

type FormaPagamento = {
  id: string;
  nome: string;
  tipo: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'outro';
  ativo: boolean;
  taxa?: number;
};

export default function PagamentosScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<FormaPagamento | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'dinheiro' as FormaPagamento['tipo'],
    ativo: true,
    taxa: '',
  });

  // Busca os métodos de pagamento reais
  const { data: pagamentos = [], isLoading, refetch } = useQuery({
    queryKey: ['payment-methods', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('created_at');

      if (error) throw error;

      return data.map(p => ({
        id: p.id,
        nome: p.name,
        tipo: p.type as FormaPagamento['tipo'],
        ativo: p.is_active,
        taxa: p.fee_percentage ? Number(p.fee_percentage) : undefined,
      }));
    },
    enabled: !!user?.tenant_id,
  });

  const getIconByType = (tipo: FormaPagamento['tipo']) => {
    switch (tipo) {
      case 'dinheiro':
        return Banknote;
      case 'pix':
        return Smartphone;
      default:
        return CreditCard;
    }
  };

  const handleOpenModal = (pagamento?: FormaPagamento) => {
    if (pagamento) {
      setEditingPagamento(pagamento);
      setFormData({
        nome: pagamento.nome,
        tipo: pagamento.tipo,
        ativo: pagamento.ativo,
        taxa: pagamento.taxa ? pagamento.taxa.toString() : '',
      });
    } else {
      setEditingPagamento(null);
      setFormData({ nome: '', tipo: 'dinheiro', ativo: true, taxa: '' });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingPagamento(null);
    setFormData({ nome: '', tipo: 'dinheiro', ativo: true, taxa: '' });
  };

  const handleTipoSelect = (tipo: FormaPagamento['tipo']) => {
    setFormData(prev => ({ ...prev, tipo }));
  };

  const handleSave = async () => {
    if (!user?.tenant_id) return;
    
    if (!formData.nome.trim()) {
      Alert.alert('Erro', 'Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const taxaParsed = formData.taxa ? parseFloat(formData.taxa.replace(',', '.')) : 0;
      
      const { error } = await supabase
        .from('payment_methods')
        .upsert({
          id: editingPagamento ? editingPagamento.id : undefined,
          tenant_id: user.tenant_id,
          name: formData.nome.trim(),
          type: formData.tipo,
          is_active: formData.ativo,
          fee_percentage: isNaN(taxaParsed) ? 0 : taxaParsed,
        });

      if (error) throw error;

      await refetch();
      Alert.alert('Sucesso', 'Forma de pagamento salva com sucesso!');
      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar pagamento:', error);
      Alert.alert('Erro', 'Não foi possível salvar a forma de pagamento.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleOpenModal()}
          activeOpacity={0.7}
        >
          <Plus size={24} color={colors.surface} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Nova Forma</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : pagamentos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Nenhuma forma de pagamento cadastrada.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.pagamentosList}>
            {pagamentos.map((pagamento) => {
              const Icon = getIconByType(pagamento.tipo);
              return (
                <TouchableOpacity
                  key={pagamento.id}
                  style={styles.pagamentoCard}
                  onPress={() => handleOpenModal(pagamento)}
                  activeOpacity={0.7}
                >
                  <View style={styles.pagamentoHeader}>
                    <View style={styles.pagamentoIcon}>
                      <Icon size={24} color='#F59E0B' strokeWidth={2} />
                    </View>
                    <View style={styles.pagamentoInfo}>
                      <Text style={styles.pagamentoNome}>{pagamento.nome}</Text>
                      {pagamento.taxa !== undefined && pagamento.taxa > 0 && (
                        <View style={styles.taxaRow}>
                          <Percent size={14} color={colors.textSecondary} />
                          <Text style={styles.taxaText}>
                            Taxa: {pagamento.taxa.toFixed(2)}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.statusBadge, pagamento.ativo ? styles.statusAtivo : styles.statusInativo]}>
                      <Text style={[styles.statusText, pagamento.ativo ? styles.statusTextAtivo : styles.statusTextInativo]}>
                        {pagamento.ativo ? 'Ativo' : 'Inativo'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
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
                {editingPagamento ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.closeButton}
                disabled={isSaving}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
              
              {/* Seleção do Tipo de Pagamento */}
              <Text style={styles.inputLabel}>Tipo *</Text>
              <View style={styles.tipoContainer}>
                <TouchableOpacity 
                  style={[styles.tipoButton, formData.tipo === 'dinheiro' && styles.tipoButtonActive]}
                  onPress={() => handleTipoSelect('dinheiro')}
                >
                  <Banknote size={20} color={formData.tipo === 'dinheiro' ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tipoButtonText, formData.tipo === 'dinheiro' && styles.tipoButtonTextActive]}>Dinheiro</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, formData.tipo === 'pix' && styles.tipoButtonActive]}
                  onPress={() => handleTipoSelect('pix')}
                >
                  <Smartphone size={20} color={formData.tipo === 'pix' ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tipoButtonText, formData.tipo === 'pix' && styles.tipoButtonTextActive]}>PIX</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, formData.tipo === 'cartao_credito' && styles.tipoButtonActive]}
                  onPress={() => handleTipoSelect('cartao_credito')}
                >
                  <CreditCard size={20} color={formData.tipo === 'cartao_credito' ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tipoButtonText, formData.tipo === 'cartao_credito' && styles.tipoButtonTextActive]}>Crédito</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tipoButton, formData.tipo === 'cartao_debito' && styles.tipoButtonActive]}
                  onPress={() => handleTipoSelect('cartao_debito')}
                >
                  <CreditCard size={20} color={formData.tipo === 'cartao_debito' ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tipoButtonText, formData.tipo === 'cartao_debito' && styles.tipoButtonTextActive]}>Débito</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome (ex: Visa, Master, PIX) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nome da forma de pagamento"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.nome}
                  onChangeText={(text) =>
                    setFormData({ ...formData, nome: text })
                  }
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Taxa da Maquininha (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.taxa}
                  onChangeText={(text) =>
                    setFormData({ ...formData, taxa: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Ativo</Text>
                <Switch
                  value={formData.ativo}
                  onValueChange={(value) =>
                    setFormData({ ...formData, ativo: value })
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                  disabled={isSaving}
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
  header: { padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, padding: 14, borderRadius: 12 },
  addButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  scrollView: { flex: 1 },
  pagamentosList: { padding: 16, gap: 12 },
  pagamentoCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  pagamentoHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  pagamentoIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F59E0B15', justifyContent: 'center', alignItems: 'center' },
  pagamentoInfo: { flex: 1, gap: 4 },
  pagamentoNome: { fontSize: 16, fontWeight: '600', color: colors.text },
  taxaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taxaText: { fontSize: 14, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusAtivo: { backgroundColor: '#10B98115' },
  statusInativo: { backgroundColor: `${colors.error}15` },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextAtivo: { color: '#10B981' },
  statusTextInativo: { color: colors.error },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  formContainer: { padding: 20 },
  tipoContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tipoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tipoButtonActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
  tipoButtonText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  tipoButtonTextActive: { color: colors.primary },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginBottom: 20 },
  switchLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, height: 48, backgroundColor: colors.background, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { flex: 1, height: 48, backgroundColor: colors.primary, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
});