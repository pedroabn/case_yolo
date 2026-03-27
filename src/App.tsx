import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Search, Filter, 
  Edit2, Trash2, 
  X, Save, Loader2, CheckCircle2,
  AlertCircle, Camera, User} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { Person, PersonType, PERSON_TYPES } from './types';

// URL base da API: aponta para o API Gateway da AWS Lambda.
// Em produção, defina VITE_API_URL no .env com a URL do API Gateway.
// Exemplo: VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('Todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
    tipo: 'Hóspede' as PersonType,
    avatarUrl: '',
    cep: '',
    endereco: ''
  });
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchPeople();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [filter, searchTerm]);

  /**
   * Busca pessoas diretamente da função AWS Lambda via API Gateway.
   * Os parâmetros `tipo` e `search` são passados como query strings.
   */
  const fetchPeople = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter && filter !== 'Todos') params.tipo = filter;
      if (searchTerm) params.search = searchTerm;

      const response = await axios.get(`${API_BASE_URL}/people`, { params });
      // Garante que o dado recebido seja um array
      const data = Array.isArray(response.data) ? response.data : [];
      setPeople(data);
    } catch (error) {
      showNotification('Erro ao carregar pessoas', 'error');
      setPeople([]);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  /**
   * Salva (cria ou atualiza) uma pessoa via AWS Lambda.
   * POST /people para criação, PUT /people/{id} para atualização.
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      setIsSaving(true);
      if (editingPerson) {
        await axios.put(`${API_BASE_URL}/people/${editingPerson.id}`, formData);
        showNotification('Cadastro atualizado com sucesso!', 'success');
      } else {
        await axios.post(`${API_BASE_URL}/people`, formData);
        showNotification('Pessoa cadastrada com sucesso!', 'success');
      }
      resetForm();
      fetchPeople();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erro inesperado ao salvar cadastro.';
      setFormError(message);
      showNotification(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  /**
   * Confirma e executa a exclusão via AWS Lambda.
   * DELETE /people/{id}
   */
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      setIsSaving(true);
      await axios.delete(`${API_BASE_URL}/people/${deleteId}`);
      showNotification('Registro excluído com sucesso!', 'success');
      fetchPeople();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erro ao excluir registro.';
      showNotification(message, 'error');
    } finally {
      setIsSaving(false);
      setDeleteId(null);
    }
  };

  const startEdit = (person: Person) => {
    setEditingPerson(person);
    setFormData({
      nome: person.nome,
      telefone: person.telefone,
      email: person.email,
      tipo: person.tipo,
      avatarUrl: person.avatarUrl || '',
      cep: person.cep || '',
      endereco: person.endereco || ''
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData({ nome: '', telefone: '', email: '', tipo: 'Hóspede', avatarUrl: '', cep: '', endereco: '' });
    setEditingPerson(null);
    setFormError(null);
    setIsFormOpen(false);
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        setIsFetchingCep(true);
        setFormError(null);
        const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
        if (response.data.erro) {
          throw new Error('CEP não encontrado.');
        }
        const { logradouro, bairro, localidade, uf } = response.data;
        setFormData(prev => ({
          ...prev,
          endereco: `${logradouro}, ${bairro}, ${localidade} - ${uf}`
        }));
      } catch (error: any) {
        const message = error.message || 'Erro ao buscar CEP.';
        setFormError(message);
        showNotification(message, 'error');
      } finally {
        setIsFetchingCep(false);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, avatarUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Cadastro de Pessoas</h1>
          <p className="text-zinc-500">Yolo Coliving Management System</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsFormOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Nova Pessoa
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="w-full">
        {/* Table Section */}
        <div className="transition-all duration-300">
          <div className="glass-card overflow-hidden">
            {/* Table Header / Filters */}
            <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50/50">
              <div className="relative flex-1 max-w-md flex items-center bg-white border border-zinc-200 rounded-lg px-2">
                {!searchTerm && <Search className="w-4 h-4 text-zinc-400 ml-1 mr-2" />}
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar por nome ou email..."
                  className="flex-1 py-2 bg-transparent focus:outline-none text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-zinc-400" />
                <select 
                  className="input-field w-auto min-w-[150px]"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                >
                  <option value="Todos">Todos os Tipos</option>
                  {PERSON_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contato</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cadastro</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-zinc-300" />
                        <p className="mt-2 text-zinc-500">Carregando dados...</p>
                      </td>
                    </tr>
                  ) : people.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Users className="w-12 h-12 mx-auto text-zinc-200 mb-4" />
                        <p className="text-zinc-500 font-medium">Nenhuma pessoa encontrada.</p>
                        <p className="text-zinc-400 text-sm">Tente mudar o filtro ou importar a base inicial.</p>
                      </td>
                    </tr>
                  ) : (
                    people.map((person) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={person.id} 
                        className="hover:bg-zinc-50/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {person.avatarUrl ? (
                              <img 
                                src={person.avatarUrl} 
                                alt={person.nome} 
                                className="w-10 h-10 rounded-full object-cover border border-zinc-200"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200">
                                <User className="w-5 h-5 text-[#2595d0]" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-zinc-900">{person.nome}</p>
                              <p className="text-xs text-zinc-400">{person.endereco || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-zinc-700">{person.email}</p>
                          <p className="text-xs text-zinc-400">{person.telefone}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${person.tipo === 'Hóspede' ? 'bg-blue-50 text-blue-700' : ''}
                            ${person.tipo === 'Proprietário' ? 'bg-purple-50 text-purple-700' : ''}
                            ${person.tipo === 'Operador' ? 'bg-emerald-50 text-emerald-700' : ''}
                            ${person.tipo === 'Fornecedor' ? 'bg-amber-50 text-amber-700' : ''}
                          `}>
                            {person.tipo}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {person.dataCadastro}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(person)}
                              className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(person.id)}
                              className="p-2 rounded-lg hover:bg-red-50 text-zinc-500 hover:text-red-600 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-100">
                <h2 className="text-xl font-bold text-zinc-900">
                  {editingPerson ? 'Editar Cadastro' : 'Nova Pessoa'}
                </h2>
                <button onClick={resetForm} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              
              <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Avatar Upload */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {formData.avatarUrl ? (
                      <img src={formData.avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-zinc-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center border-2 border-zinc-200">
                        <User className="w-8 h-8 text-zinc-400" />
                      </div>
                    )}
                    <label className="absolute -bottom-1 -right-1 p-1.5 bg-white border border-zinc-200 rounded-full cursor-pointer hover:bg-zinc-50 transition-colors shadow-sm">
                      <Camera className="w-3 h-3 text-zinc-600" />
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    </label>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formData.nome}
                      onChange={e => setFormData({ ...formData, nome: e.target.value })}
                      className="input-field w-full"
                      placeholder="Nome da pessoa"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">E-mail *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="input-field w-full"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone</label>
                    <input
                      type="tel"
                      value={formData.telefone}
                      onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                      className="input-field w-full"
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo *</label>
                  <select
                    required
                    value={formData.tipo}
                    onChange={e => setFormData({ ...formData, tipo: e.target.value as PersonType })}
                    className="input-field w-full"
                  >
                    {PERSON_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">CEP</label>
                    <input
                      type="text"
                      value={formData.cep}
                      onChange={e => setFormData({ ...formData, cep: e.target.value })}
                      onBlur={handleCepBlur}
                      className="input-field w-full"
                      placeholder="00000-000"
                      maxLength={9}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Endereço {isFetchingCep && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                    </label>
                    <input
                      type="text"
                      value={formData.endereco}
                      onChange={e => setFormData({ ...formData, endereco: e.target.value })}
                      className="input-field w-full"
                      placeholder="Preenchido automaticamente"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    {editingPerson ? 'Salvar Alterações' : 'Cadastrar'}
                  </button>
                  <button type="button" onClick={resetForm} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteId(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 mb-2">Confirmar Exclusão</h3>
              <p className="text-zinc-500 mb-8">
                Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-600/20"
                >
                  Sim, Excluir
                </button>
                <button 
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Saving Overlay */}
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-white/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-[#df2180]/20 border-t-[#df2180] rounded-full animate-spin" />
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse" }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Save className="w-6 h-6 text-[#df2180]" />
                </motion.div>
              </div>
              <p className="text-zinc-900 font-bold text-lg animate-pulse">Sincronizando com DynamoDB...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg flex items-center gap-3 z-50
              ${notification.type === 'success' ? 'bg-zinc-900 text-white' : 'bg-red-600 text-white'}
            `}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
