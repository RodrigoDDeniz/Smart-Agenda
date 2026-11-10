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
  ActivityIndicator,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import {
  Plus,
  Search,
  UserCog,
  X,
  Check,
  Trash2,
  Briefcase,
} from 'lucide-react-native';

type Funcionario = {
  id: string; 
  user_id: string; 
  nome: string;
  especialidade: string;
  ativo: boolean;
};

export default function FuncionariosScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFuncionario, setEditingFuncionario] = useState<Funcionario | null>(null);

  const [formData, setFormData] = useState({
    nome: '', 
    especialidade: '',
  });

  // 1. Busca os funcionários (barbeiros)
  const { data: funcionarios = [], isLoading } = useQuery({
    queryKey: ['barbers', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('barbers') 
        .select(`
          id,
          user_id,
          specialty,
          is_active,
          users (
            full_name
          )
        `)
        .eq('tenant_id', user.tenant_id);

      if (error) throw error;
      
      return data.map((b: any) => ({
        id: b.id,
        user_id: b.user_id,
        nome: b.users?.full_name || 'Usuário Sem Nome',
        especialidade: b.specialty || '',
        ativo: b.is_active,
      })) as Funcionario[];
    },
    enabled: !!user?.tenant_id,
  });

  // 2. Filtra os funcionários
  const filteredFuncionarios = funcionarios.filter((funcionario) => {
    const nomeSeguro = funcionario.nome || '';
    const especSegura = funcionario.especialidade || '';
    const buscaSegura = searchQuery.toLowerCase();

    return (
      nomeSeguro.toLowerCase().includes(buscaSegura) ||
      especSegura.toLowerCase().includes(buscaSegura)
    );
  });

  // 3. Atualiza apenas a especialidade
  const saveFuncionarioMutation = useMutation({
    mutationFn: async () => {
      if (!formData.especialidade) {
        throw new Error('A especialidade é obrigatória');
      }

      if (!editingFuncionario) {
          throw new Error('A criação de novos usuários requer um convite no painel de administração.');
      }

      const { error } = await supabase
        .from('barbers')
        .update({
          specialty: formData.especialidade,
        })
        .eq('id', editingFuncionario.id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barbers'] });
      Alert.alert('Sucesso', 'Especialidade atualizada!');
      handleCloseModal();
    },
    onError: (error: Error) => {
      Alert.alert('Erro ao salvar', error.message);
    }
  });

  // 4. Inativa o funcionário (soft delete)
  const deleteFuncionarioMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('barbers')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barbers'] });
      Alert.alert('Sucesso', 'Funcionário inativado (oculto da agenda)!');
      handleCloseModal();
    },
    onError: (error: Error) => {
      Alert.alert('Erro ao excluir', error.message);
    }
  });

  const confirmDelete = () => {
    if (!editingFuncionario) return;
    Alert.alert(
      'Inativar Funcionário',
      `Tem certeza que deseja inativar "${editingFuncionario.nome}"? Ele deixará de aparecer na agenda.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Inativar', 
          style: 'destructive', 
          onPress: () => deleteFuncionarioMutation.mutate(editingFuncionario.id) 
        }
      ]
    );
  };

  const handleOpenModal = (funcionario?: Funcionario) => {
    if (funcionario) {
      setEditingFuncionario(funcionario);
      setFormData({
        nome: funcionario.nome,
        especialidade: funcionario.especialidade,
      });
      setModalVisible(true);
    } else {
      Alert.alert('Atenção', 'Para adicionar um novo funcionário, peça-lhe para criar conta no aplicativo e associe-o depois a este estabelecimento.');
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingFuncionario(null);
    setFormData({ nome: '', especialidade: '' });
  };

  const handleSave = () => {
    saveFuncionarioMutation.mutate();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou especialidade..."
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
         <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
         </View>
      ) : (
        <ScrollView style={styles.scrollView}>
            <View style={styles.funcionariosList}>
            {filteredFuncionarios.filter(f => f.ativo).map((funcionario) => (
                <TouchableOpacity
                key={funcionario.id}
                style={styles.funcionarioCard}
                onPress={() => handleOpenModal(funcionario)}
                activeOpacity={0.7}
                >
                <View style={styles.funcionarioHeader}>
                    <View style={styles.funcionarioAvatar}>
                    <UserCog size={24} color='#10B981' strokeWidth={2} />
                    </View>
                    <View style={styles.funcionarioInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.funcionarioName}>{funcionario.nome}</Text>
                        <View style={styles.badgeAtivo}>
                          <Text style={styles.badgeAtivoText}>Ativo</Text>
                        </View>
                      </View>
                      <View style={styles.funcionarioDetail}>
                          <Briefcase size={14} color={colors.textSecondary} />
                          <Text style={styles.funcionarioDetailText}>
                          {funcionario.especialidade || 'Sem especialidade definida'}
                          </Text>
                      </View>
                    </View>
                </View>
                </TouchableOpacity>
            ))}
            {filteredFuncionarios.filter(f => f.ativo).length === 0 && (
                <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 20 }}>
                    Nenhum funcionário encontrado.
                </Text>
            )}
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
                {editingFuncionario ? 'Editar Profissional' : 'Novo Profissional'}
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.closeButton}
                disabled={saveFuncionarioMutation.isPending}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome do Usuário</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.borderLight, color: colors.textSecondary }]}
                  value={formData.nome}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Especialidade *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Cabelo, Barba, Completo"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.especialidade}
                  onChangeText={(text) =>
                    setFormData({ ...formData, especialidade: text })
                  }
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCloseModal}
                  activeOpacity={0.7}
                  disabled={saveFuncionarioMutation.isPending}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                {editingFuncionario && (
                  <TouchableOpacity
                    style={[styles.cancelButton, { flex: 0, width: 48, borderColor: colors.error, backgroundColor: `${colors.error}10` }]}
                    onPress={confirmDelete}
                    activeOpacity={0.7}
                    disabled={saveFuncionarioMutation.isPending}
                  >
                    <Trash2 size={20} color={colors.error} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.7}
                  disabled={saveFuncionarioMutation.isPending}
                >
                  {saveFuncionarioMutation.isPending ? (
                      <ActivityIndicator color={colors.surface} size="small"/>
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
  scrollView: { flex: 1 },
  funcionariosList: { padding: 16, gap: 12 },
  funcionarioCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  funcionarioHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  funcionarioAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#10B98115', justifyContent: 'center', alignItems: 'center' },
  funcionarioInfo: { flex: 1, gap: 6, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  funcionarioName: { fontSize: 16, fontWeight: '600', color: colors.text },
  badgeAtivo: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeAtivoText: { fontSize: 12, color: '#065F46', fontWeight: '600' },
  funcionarioDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  funcionarioDetailText: { fontSize: 14, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  closeButton: { padding: 4 },
  formContainer: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, height: 48, backgroundColor: colors.background, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { flex: 1, height: 48, backgroundColor: colors.primary, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.surface },
});