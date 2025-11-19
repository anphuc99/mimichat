
export type Sender = 'user' | 'bot';

export interface RelationInfo {
  opinion: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  closeness?: number;
}

export interface Character {
  id: string;
  name: string;
  personality: string;
  gender: 'male' | 'female';
  voiceName?: string;
  pitch?: number;
  speakingRate?: number;
  relations?: { [targetCharacterId: string]: RelationInfo };
  userOpinion?: RelationInfo;
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  characterName?: string;
  audioData?: string;
  translation?: string;
  isError?: boolean;
  rawText?: string;
}

export interface CharacterThought {
  characterName: string;
  text: string;
  audioData?: string;
  tone: string;
}

export interface DailyChat {
  id: string;
  date: string;
  summary: string;
  messages: Message[];
  characterThoughts?: CharacterThought[];
}

export type ChatJournal = DailyChat[];

export interface SavedData {
  version: 4;
  journal: ChatJournal;
  characters: Character[];
  activeCharacterIds: string[];
  context: string;
  relationshipSummary?: string;
}