import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Search, Filter,
  Edit2, Trash2,
  X, Save, Loader2, CheckCircle2,
  AlertCircle, Camera, User, RefreshCw, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { Person, PersonType, PERSON_TYPES } from './types';
 
// VITE_API_URL já inclui /api no final:
// ex: https://xxx.execute-api.us-east-2.amazonaws.com/dev/api
// Logo as rotas são: ${API_BASE}/people, ${API_BASE}/import etc.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
 
type NotificationType = 'success' | 'error' | 'processing';
interface Notification { message: string; type: NotificationType; }
 
const REFETCH_DELAY_MS = 2000;
 
export default function App() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('Todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFetchingCep, setIsFetchingCep] = useState(false);
 
  const [formData, setFormData] = useState({
    nome: '', telefone: '', email: '',
    tipo: 'Hóspede' as PersonType,
    avatarUrl: '', cep: '', endereco: '',
  });

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter && filter !== 'Todos') params.set('tipo', filter);
      if (searchTerm) params.set('search', searchTerm);

      const response = await axios.get(`${API_BASE}/people?${params}`);

      // API Gateway pode entregar o body como string em vez de objeto
      let raw = response.data;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      // Fallback: envelope { body: "[...]" }
      if (raw && !Array.isArray(raw) && typeof raw.body === 'string') {
        try { raw = JSON.parse(raw.body); } catch { raw = []; }
      }

      const data: Person[] = Array.isArray(raw) ? raw : [];
      console.log('[fetchPeople] recebido:', data.length, 'registros');
      setPeople(data);
    } catch (err) {
      console.error('[fetchPeople] erro:', err);
      showNotification('Erro ao carregar pessoas', 'error');
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [filter, searchTerm]);

  // ------------------------------------------------------------------
  // Notificações
  // ------------------------------------------------------------------

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ message, type });
    const duration = type === 'processing' ? 2000 : 3000;
    setTimeout(() => setNotification(null), duration);
  };

  /**
   * Lida com respostas 202 do padrão event-driven (EventBridge).
   * Mostra "processando" e re-fetcha após o delay para confirmar.
   */
  const handleAsyncResponse = (successMessage: string) => {
    showNotification('Evento publicado — processando...', 'processing');
    setTimeout(async () => {
      await fetchPeople();
      showNotification(successMessage, 'success');
    }, REFETCH_DELAY_MS);
  };

  // ------------------------------------------------------------------
  // Salvar (criar / editar)
  // ------------------------------------------------------------------

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      let response;
      if (editingPerson) {
        response = await axios.put(
          `${API_BASE}/people/${editingPerson.id}`,
          formData
        );
      } else {
        response = await axios.post(`${API_BASE}/people`, formData);
      }

      resetForm();

      if (response.status === 202) {
        // Async: EventBridge vai processar
        handleAsyncResponse(
          editingPerson ? 'Cadastro atualizado com sucesso!' : 'Pessoa cadastrada com sucesso!'
        );
      } else {
        // Síncrono (dev LOCAL_SYNC retorna 200/201)
        await fetchPeople();
        showNotification(
          editingPerson ? 'Cadastro atualizado!' : 'Pessoa cadastrada!',
          'success'
        );
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const message =
        axiosError.response?.data?.message || 'Erro inesperado ao salvar.';
      setFormError(message);
      showNotification(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Excluir
  // ------------------------------------------------------------------

  const handleDelete = (id: string) => setDeleteId(id);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsSaving(true);
    try {
      const response = await axios.delete(
        `${API_BASE}/people/${deleteId}`
      );

      if (response.status === 202) {
        handleAsyncResponse('Registro excluído com sucesso!');
      } else {
        await fetchPeople();
        showNotification('Registro excluído!', 'success');
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const message =
        axiosError.response?.data?.message || 'Erro ao excluir registro.';
      showNotification(message, 'error');
    } finally {
      setIsSaving(false);
      setDeleteId(null);
    }
  };

  // ------------------------------------------------------------------
  // Importar base externa
  // ------------------------------------------------------------------

  const handleImport = async () => {
    setIsSaving(true);
    try {
      const response = await axios.post(`${API_BASE}/import`);
      if (response.status === 202) {
        handleAsyncResponse('Importação concluída!');
      } else {
        await fetchPeople();
        showNotification('Importação concluída!', 'success');
      }
    } catch {
      showNotification('Erro na importação', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Formulário
  // ------------------------------------------------------------------

  const startEdit = (person: Person) => {
    setEditingPerson(person);
    setFormData({
      nome: person.nome,
      telefone: person.telefone,
      email: person.email,
      tipo: person.tipo,
      avatarUrl: person.avatarUrl || '',
      cep: person.cep || '',
      endereco: person.endereco || '',
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '', telefone: '', email: '',
      tipo: 'Hóspede', avatarUrl: '', cep: '', endereco: '',
    });
    setEditingPerson(null);
    setFormError(null);
    setIsFormOpen(false);
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      setIsFetchingCep(true);
      setFormError(null);
      const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
      if (response.data.erro) throw new Error('CEP não encontrado.');
      const { logradouro, bairro, localidade, uf } = response.data;
      setFormData(prev => ({
        ...prev,
        endereco: `${logradouro}, ${bairro}, ${localidade} - ${uf}`,
      }));
    } catch (error: unknown) {
      const err = error as Error;
      const message = err.message || 'Erro ao buscar CEP.';
      setFormError(message);
    } finally {
      setIsFetchingCep(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              Cadastro de Pessoas
            </h1>
          </div>
          <p className="text-zinc-500">Yolo Coliving — Serverless Event-Driven</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Importar Base
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Nova Pessoa
          </button>
        </div>
      </header>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50/50">
          <div className="relative flex-1 max-w-md flex items-center bg-white border border-zinc-200 rounded-lg px-2">
            <Search className="w-4 h-4 text-zinc-400 ml-1 mr-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
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

        {/* Table body */}
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
                    <p className="text-zinc-400 text-sm">
                      Clique em "Importar Base" ou cadastre uma nova pessoa.
                    </p>
                  </td>
                </tr>
              ) : (
                people.map(person => (
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
                          <div className="font-medium text-zinc-900">{person.nome}</div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {person.id.split('-')[0]}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-zinc-600">{person.email}</div>
                      <div className="text-sm text-zinc-400">{person.telefone}</div>
                      {person.endereco && (
                        <div className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-zinc-300" />
                          {person.endereco}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${person.tipo === 'Hóspede' ? 'bg-blue-50 text-blue-700' :
                          person.tipo === 'Proprietário' ? 'bg-purple-50 text-purple-700' :
                          person.tipo === 'Operador' ? 'bg-amber-50 text-amber-700' :
                          'bg-emerald-50 text-emerald-700'}
                      `}>
                        {person.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {new Date(person.dataCadastro).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(person)}
                          className="p-2 text-zinc-400 hover:text-[#df2180] hover:bg-[#df2180]/5 rounded-lg border border-transparent hover:border-[#df2180]/20 transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(person.id)}
                          className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"
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

      {/* Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-10 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3 text-zinc-900">
                  {editingPerson
                    ? <Edit2 className="w-5 h-5 text-[#df2180]" />
                    : <UserPlus className="w-5 h-5 text-[#df2180]" />}
                  {editingPerson ? 'Atualizar Cadastro' : 'Novo Cadastro'}
                </h2>
                <button onClick={resetForm} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-10">
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-xs font-medium"
                  >
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {formError}
                  </motion.div>
                )}

                <div className="flex flex-col md:flex-row md:items-start gap-10">
                  {/* Avatar */}
                  <div className="flex flex-col items-center shrink-0 md:pt-8">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-zinc-100 border-2 border-dashed border-zinc-300 flex items-center justify-center overflow-hidden transition-all group-hover:border-[#df2180]">
                        {formData.avatarUrl ? (
                          <img
                            src={formData.avatarUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="w-8 h-8 text-[#2595d0]" />
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Camera className="w-5 h-5 text-white" />
                          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </label>
                      </div>
                      {formData.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, avatarUrl: '' }))}
                          className="absolute -top-1 -right-1 bg-white shadow-md rounded-full p-1 text-zinc-400 hover:text-red-500 border border-zinc-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 font-bold uppercase tracking-tighter">Foto</p>
                  </div>

                  {/* Campos principais */}
                  <div className="flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider">
                          Nome Completo
                        </label>
                        <input
                          type="text"
                          required
                          className="input-field w-full text-sm"
                          value={formData.nome}
                          onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                          placeholder="Ex: Nome completo"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider">
                          Tipo
                        </label>
                        <select
                          className="input-field w-full text-sm"
                          value={formData.tipo}
                          onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value as PersonType }))}
                        >
                          {PERSON_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider">
                          E-mail
                        </label>
                        <input
                          type="email"
                          required
                          className="input-field w-full text-sm"
                          value={formData.email}
                          onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="email@email.com"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider">
                          Telefone
                        </label>
                        <input
                          type="tel"
                          required
                          className="input-field w-full text-sm"
                          value={formData.telefone}
                          onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 11) val = val.slice(0, 11);
                            if (val.length > 2) val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
                            if (val.length > 9) val = `${val.slice(0, 9)}-${val.slice(9)}`;
                            setFormData(prev => ({ ...prev, telefone: val }));
                          }}
                          placeholder="(81) 99999-9999"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-12 gap-y-10">
                  <div className="md:col-span-1">
                    <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider flex items-center justify-between">
                      CEP
                      {isFetchingCep && <Loader2 className="w-3 h-3 animate-spin text-[#df2180]" />}
                    </label>
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      value={formData.cep}
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 8) val = val.slice(0, 8);
                        if (val.length > 5) val = `${val.slice(0, 5)}-${val.slice(5)}`;
                        setFormData(prev => ({ ...prev, cep: val }));
                      }}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[11px] font-bold text-zinc-500 mb-3 block uppercase tracking-wider">
                      Endereço
                    </label>
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      value={formData.endereco}
                      onChange={e => setFormData(prev => ({ ...prev, endereco: e.target.value }))}
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-3 text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#df2180]/20"
                  >
                    <Save className="w-4 h-4" />
                    {editingPerson ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                  </button>
                  <button type="button" onClick={resetForm} className="btn-secondary flex-1 py-3 text-base font-bold">
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
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
                Tem certeza? Esta ação não pode ser desfeita.
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
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-[#df2180]" />
                </div>
              </div>
              <p className="text-zinc-900 font-bold text-lg animate-pulse">
                Publicando evento...
              </p>
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
              ${notification.type === 'success' ? 'bg-zinc-900 text-white' :
                notification.type === 'processing' ? 'bg-violet-600 text-white' :
                'bg-red-600 text-white'}
            `}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {notification.type === 'processing' && <Zap className="w-5 h-5 text-violet-200 animate-pulse" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
