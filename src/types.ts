export type PersonType = 'Hóspede' | 'Proprietário' | 'Operador' | 'Fornecedor';

export interface Person {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  tipo: PersonType;
  dataCadastro: string;
  avatarUrl?: string;
  cep?: string;
  endereco?: string;
}

export const PERSON_TYPES: PersonType[] = ['Hóspede', 'Proprietário', 'Operador', 'Fornecedor'];
