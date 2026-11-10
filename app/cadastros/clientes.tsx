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
  User,
  Phone,
  Mail,
  X,
  Check,
} from 'lucide-react-native';

type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  isVip: boolean;
  totalAtendimentos: number;
  ultimoAtendimento?: string;
};

export default function ClientesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    endereco: '',
  });

  // 1. Vai buscar os clientes reais ao Supabase
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clients', user?.tenant_id],
    queryFn: async () => {
      if (!user?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', user.tenant_id)
        .order('name', { ascending: true });

      if (error) throw error;
      
      // Converte os dados do banco (name, phone) para os nomes que o seu visual já espera (nome, telefone)
      return data.map((c: any) => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone,
        email: c.email,
        endereco: '', 
        isVip: false, 
        totalAtendimentos: 0, 
        ultimoAtendimento: undefined,
      })) as Cliente[];
    },
    enabled: !!user?.tenant_id,
  });

// 2. Filtra os clientes baseados na pesquisa (agora com proteção contra campos vazios)
  const filteredClientes = clientes.filter((cliente) => {
    const nomeSeguro = cliente.nome || '';
    const telefoneSeguro = cliente.telefone || '';
    const buscaSegura = searchQuery.toLowerCase();
    
    return (
      nomeSeguro.toLowerCase().includes(buscaSegura) ||
      telefoneSeguro.includes(searchQuery)
    );
  });

  // 3. Função para guardar ou atualizar o cliente na base de dados
  const saveClientMutation = useMutation({
    mutationFn: async () => {
      if (!formData.nome || !formData.telefone) {
        throw new Error('Nome e telefone são obrigatórios');
      }

      const clientData = {
        tenant_id: user?.tenant_id,
        name: formData.nome,
        phone: formData.telefone,
        email: formData.email || null,
      };

      if (editingCliente) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingCliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clients')
          .insert(clientData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      Alert.alert('Sucesso', 'Cliente salvo com sucesso!');
      handleCloseModal();
    },
    onError: (error: Error) => {
      Alert.alert('Erro ao salvar', error.message);
    }
  });

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData({
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email || '',
        endereco: cliente.endereco || '',
      });
    } else {
      setEditingCliente(null);
      setFormData({ nome: '', telefone: '', email: '', endereco: '' });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCliente(null);
    setFormData({ nome: '', telefone: '', email: '', endereco: '' });
  };

  const handleSave = () => {
    saveClientMutation.mutate();
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

        <ScrollView style={styles.scrollView}>
          <View style={styles.clientesList}>
            {filteredClientes.map((cliente) => (
              <TouchableOpacity
                key={cliente.id}
                style={styles.clienteCard}
                onPress={() => handleOpenModal(cliente)}
                activeOpacity={0.7}
              >
                <View style={styles.clienteHeader}>
                  <View style={styles.clienteAvatar}>
                    <User size={24} color={colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.clienteInfo}>
                    <View style={styles.clienteNameRow}>
                      <Text style={styles.clienteName}>{cliente.nome}</Text>
                      {cliente.isVip && (
                        <View style={styles.vipBadge}>
                          <Text style={styles.vipText}>VIP</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.clienteDetail}>
                      <Phone size={14} color={colors.textSecondary} />
                      <Text style={styles.clienteDetailText}>
                        {cliente.telefone}
                      </Text>
                    </View>
                    {cliente.email && (
                      <View style={styles.clienteDetail}>
                        <Mail size={14} color={colors.textSecondary} />
                        <Text style={styles.clienteDetailText}>
                          {cliente.email}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.clienteStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {cliente.totalAtendimentos}
                    </Text>
                    <Text style={styles.statLabel}>Atendimentos</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {cliente.ultimoAtendimento
                        ? new Date(cliente.ultimoAtendimento).toLocaleDateString(
                            'pt-BR'
                          )
                        : '-'}
                    </Text>
                    <Text style={styles.statLabel}>Último</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
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
                  {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
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
                  <Text style={styles.inputLabel}>Nome *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome completo"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.nome}
                    onChangeText={(text) =>
                      setFormData({ ...formData, nome: text })
                    }
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
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>E-mail</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="email@exemplo.com"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.email}
                    onChangeText={(text) =>
                      setFormData({ ...formData, email: text })
                    }
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Endereço</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Rua, número, complemento"
                    placeholderTextColor={colors.textSecondary}
                    value={formData.endereco}
                    onChangeText={(text) =>
                      setFormData({ ...formData, endereco: text })
                    }
                  />
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  clientesList: {
    padding: 16,
    gap: 12,
  },
  clienteCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  clienteHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  clienteAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clienteInfo: {
    flex: 1,
    gap: 6,
  },
  clienteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clienteName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  vipBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vipText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.surface,
  },
  clienteDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clienteDetailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  clienteStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    lineHeight: 14,           // >= fontSize
    color: colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false, // reduz padding extra no Android
    marginTop: 2,
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
    backgroundColor: colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.surface,
  },
});
