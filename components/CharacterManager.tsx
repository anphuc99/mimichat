
import React, { useState } from 'react';
import type { Character, RelationInfo } from '../types';
import http, { API_URL } from '../services/HTTPService';
import { generateCharacterPrompt } from '../services/geminiService';

interface CharacterManagerProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  activeCharacterIds: string[];
  setActiveCharacterIds: React.Dispatch<React.SetStateAction<string[]>>;
  textToSpeech: (text: string, tone: string, voiceName: string) => Promise<string | null>;
  playAudio: (audioData: string, speakingRate?: number, pitch?: number) => void;
  storyPlot: string;
  setStoryPlot: React.Dispatch<React.SetStateAction<string>>;
}

const AVAILABLE_VOICES = [
    { value: "alloy", label: "Alloy – Nữ trẻ, tự nhiên" },
    { value: "ballad", label: "Ballad – Nữ dịu dàng, mềm, tình cảm" },
    { value: "coral", label: "Coral – Nữ tươi sáng, rõ ràng" },

    { value: "cedar", label: "Cedar – Nam trưởng thành, trầm ấm" },

    { value: "echo", label: "Echo – Trung tính, nhẹ, có chiều sâu" },
    { value: "fable", label: "Fable – Kể chuyện, truyền cảm" },
    { value: "marin", label: "Marin – Nhẹ nhàng, mang hơi thở biển" },
    { value: "nova", label: "Nova – Trẻ trung, năng lượng" },
    { value: "onyx", label: "Onyx – Giọng trầm, huyền bí" },
];

export const CharacterManager: React.FC<CharacterManagerProps> = ({ 
    isOpen, 
    onClose, 
    characters, 
    setCharacters, 
    activeCharacterIds, 
    setActiveCharacterIds,
    textToSpeech,
    playAudio,
    storyPlot,
    setStoryPlot
}) => {
  const [newCharName, setNewCharName] = useState('');
  const [newCharPersonality, setNewCharPersonality] = useState('');
  const [newCharGender, setNewCharGender] = useState<'male' | 'female'>('female');
  const [newCharVoiceName, setNewCharVoiceName] = useState('Kore');
  const [newCharPitch, setNewCharPitch] = useState(0);
  const [newCharSpeakingRate, setNewCharSpeakingRate] = useState(1.0);
  const [newCharAvatar, setNewCharAvatar] = useState<string | undefined>(undefined);
  const [newCharAppearance, setNewCharAppearance] = useState('');

  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedPersonality, setEditedPersonality] = useState('');
  const [editedGender, setEditedGender] = useState<'male' | 'female'>('female');
  const [editedVoiceName, setEditedVoiceName] = useState('Kore');
  const [editedPitch, setEditedPitch] = useState(0);
  const [editedSpeakingRate, setEditedSpeakingRate] = useState(1.0);
  const [editedAvatar, setEditedAvatar] = useState<string | undefined>(undefined);
  const [editedAppearance, setEditedAppearance] = useState('');
  const [editedRelations, setEditedRelations] = useState<{ [targetCharacterId: string]: RelationInfo }>({});
  const [editedUserOpinion, setEditedUserOpinion] = useState<RelationInfo>({ opinion: '', sentiment: 'neutral', closeness: 0 });
  const [editedPromptDescription, setEditedPromptDescription] = useState('');
  const [showOpinionsSection, setShowOpinionsSection] = useState(false);

  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);


  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        try {
            // Upload to server
            const charName = isNew ? newCharName : editedName;
            const response = await http.post(API_URL.API_UPLOAD_AVATAR, { 
                image: base64Data, 
                filename: file.name,
                characterName: charName
            });

            if (response.ok && response.data?.url) {
                // Use server URL
                const fullUrl = `${http.getBaseUrl()}${response.data.url}`;
                if (isNew) {
                    setNewCharAvatar(fullUrl);
                } else {
                    setEditedAvatar(fullUrl);
                }
            } else {
                // Fallback to base64 if upload fails
                console.warn("Avatar upload failed, using local base64");
                if (isNew) {
                    setNewCharAvatar(base64Data);
                } else {
                    setEditedAvatar(base64Data);
                }
            }
        } catch (error) {
            console.error("Error uploading avatar:", error);
             if (isNew) {
                setNewCharAvatar(base64Data);
            } else {
                setEditedAvatar(base64Data);
            }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleToggleActive = (charId: string) => {
    setActiveCharacterIds(prev => {
      const isCurrentlyActive = prev.includes(charId);
      if (isCurrentlyActive) {
        if (prev.length === 1) {
          alert("Phải có ít nhất một nhân vật trong cảnh.");
          return prev;
        }
        return prev.filter(id => id !== charId);
      } else {
        return [...prev, charId];
      }
    });
  };

  const handleAddCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharName.trim() || !newCharPersonality.trim()) return;
    const newCharacter: Character = {
      id: Date.now().toString(),
      name: newCharName,
      personality: newCharPersonality,
      gender: newCharGender,
      voiceName: newCharVoiceName,
      pitch: newCharPitch,
      speakingRate: newCharSpeakingRate,
      avatar: newCharAvatar,
      appearance: newCharAppearance,
      relations: {},
      userOpinion: { opinion: '', sentiment: 'neutral', closeness: 0 },
    };
    setCharacters(prev => [...prev, newCharacter]);
    setNewCharName('');
    setNewCharPersonality('');
    setNewCharGender('female');
    setNewCharVoiceName('Kore');
    setNewCharPitch(0);
    setNewCharSpeakingRate(1.0);
    setNewCharAvatar(undefined);
    setNewCharAppearance('');
  };
  
  const startEditing = (char: Character) => {
    setEditingCharId(char.id);
    setEditedName(char.name);
    setEditedPersonality(char.personality);
    setEditedGender(char.gender);
    setEditedVoiceName(char.voiceName || 'Kore');
    setEditedPitch(char.pitch ?? 0);
    setEditedSpeakingRate(char.speakingRate ?? 1.0);
    setEditedAvatar(char.avatar);
    setEditedAppearance(char.appearance || '');
    setEditedRelations(char.relations || {});
    setEditedUserOpinion(char.userOpinion || { opinion: '', sentiment: 'neutral', closeness: 0 });
    setEditedPromptDescription(char.promptDescription || '');
    setShowOpinionsSection(false);
  };

  const cancelEditing = () => {
    setEditingCharId(null);
    setShowOpinionsSection(false);
  };

  const saveChanges = () => {
    if (!editingCharId || !editedName.trim() || !editedPersonality.trim()) return;
    
    setCharacters(prev => 
      prev.map(char => 
        char.id === editingCharId 
          ? { 
              ...char, 
              name: editedName, 
              personality: editedPersonality, 
              gender: editedGender, 
              voiceName: editedVoiceName, 
              pitch: editedPitch, 
              speakingRate: editedSpeakingRate,
              avatar: editedAvatar,
              appearance: editedAppearance,
              relations: editedRelations,
              userOpinion: editedUserOpinion,
              promptDescription: editedPromptDescription || undefined,
            }
          : char
      )
    );
    setEditingCharId(null);
    setShowOpinionsSection(false);
  };

  const handleGeneratePrompt = async () => {
    if (!editingCharId) return;
    
    setIsGeneratingPrompt(true);
    try {
      const tempCharacter: Character = {
        id: editingCharId,
        name: editedName,
        personality: editedPersonality,
        gender: editedGender,
        voiceName: editedVoiceName,
        pitch: editedPitch,
        speakingRate: editedSpeakingRate,
        avatar: editedAvatar,
        appearance: editedAppearance,
        relations: editedRelations,
        userOpinion: editedUserOpinion,
      };

      const prompt = await generateCharacterPrompt(tempCharacter, characters);
      setEditedPromptDescription(prompt);
    } catch (err) {
      console.error('Failed to generate character prompt:', err);
      alert('Không thể tạo prompt. Vui lòng thử lại.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const isPredefined = (charId: string) => ['mimi', 'lisa', 'klee'].includes(charId);

  const deleteCharacter = (charId: string) => {
    if (isPredefined(charId)) return;
    if (window.confirm("Bạn có chắc chắn muốn xóa nhân vật này không?")) {
        setCharacters(prev => prev.filter(char => char.id !== charId));
        setActiveCharacterIds(prev => prev.filter(id => id !== charId));
    }
  };

  const handlePreviewAudio = async (previewId: string, voice: string, pitch: number, rate: number) => {
    setIsPreviewing(previewId);
    try {
        // const audioData = await textToSpeech("안녕하세요", 'cheerfully', voice);
        // if (audioData) {
        //     playAudio(audioData, rate, pitch);
        // }
        console.log(voice)
        playAudio(voice, rate, pitch)
    } catch (error) {
        console.error("Failed to play preview audio:", error);
        alert("Không thể phát âm thanh xem trước.");
    } finally {
        setIsPreviewing(null);
    }
  };

  const updateRelationOpinion = (targetId: string, field: keyof RelationInfo, value: any) => {
    setEditedRelations(prev => ({
      ...prev,
      [targetId]: {
        ...prev[targetId],
        [field]: value,
      }
    }));
  };

  const updateUserOpinion = (field: keyof RelationInfo, value: any) => {
    setEditedUserOpinion(prev => ({
      ...prev,
      [field]: value,
    }));
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Quản lý nhân vật & Cốt truyện</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 pr-2">
          {/* Story Plot Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">📖 Mô tả cốt truyện</h3>
            <textarea
              value={storyPlot}
              onChange={(e) => setStoryPlot(e.target.value)}
              placeholder="Mô tả cốt truyện, bối cảnh câu chuyện, mục tiêu của các nhân vật... (VD: Mimi và bạn bè đang ở trường học, họ chuẩn bị cho buổi biểu diễn văn nghệ...)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Cốt truyện sẽ giúp AI hiểu ngữ cảnh câu chuyện và điều khiển các nhân vật phù hợp hơn.
            </p>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Nhân vật trong cảnh</h3>
            <div className="space-y-2">
              {characters.map(char => (
                <div key={char.id} className="p-2 rounded-md hover:bg-gray-100 transition-colors">
                  {editingCharId === char.id ? (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="space-y-3">
                        <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        <textarea value={editedPersonality} onChange={(e) => setEditedPersonality(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" rows={3} placeholder="Tính cách"/>
                        <textarea value={editedAppearance} onChange={(e) => setEditedAppearance(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" rows={2} placeholder="Mô tả ngoại hình (để tạo ảnh)"/>
                        <div className="flex items-center space-x-2">
                          <select value={editedGender} onChange={(e) => setEditedGender(e.target.value as 'male' | 'female')} className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="female">Nữ</option>
                            <option value="male">Nam</option>
                          </select>
                           <select value={editedVoiceName} onChange={(e) => setEditedVoiceName(e.target.value)} className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
                            {AVAILABLE_VOICES.map(voice => <option key={voice.value} value={voice.value}>{voice.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="edit-pitch" className="text-sm font-medium text-gray-700">Cao độ: {editedPitch.toFixed(1)}</label>
                          <input id="edit-pitch" type="range" min="-20" max="20" step="0.5" value={editedPitch} onChange={(e) => setEditedPitch(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div>
                          <label htmlFor="edit-rate" className="text-sm font-medium text-gray-700">Tốc độ nói: {editedSpeakingRate.toFixed(2)}x</label>
                          <input id="edit-rate" type="range" min="0.25" max="4.0" step="0.05" value={editedSpeakingRate} onChange={(e) => setEditedSpeakingRate(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Avatar:</label>
                          <div className="flex items-center space-x-2 mt-1">
                            {editedAvatar && <img src={editedAvatar} alt="Avatar Preview" className="w-10 h-10 rounded-full object-cover" />}
                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, false)} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                          </div>
                        </div>

                        {/* Opinions Section */}
                        <div className="border-t border-gray-300 pt-3 mt-2">
                          <button 
                            type="button"
                            onClick={() => setShowOpinionsSection(!showOpinionsSection)}
                            className="flex items-center justify-between w-full text-left text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
                          >
                            <span>💭 Quan điểm về người khác</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform ${showOpinionsSection ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {showOpinionsSection && (
                            <div className="mt-3 space-y-4 pl-2">
                              {/* User Opinion */}
                              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">👤 Về người dùng:</label>
                                <textarea
                                  value={editedUserOpinion.opinion || ''}
                                  onChange={(e) => updateUserOpinion('opinion', e.target.value)}
                                  placeholder="Nhân vật này nghĩ gì về người dùng?"
                                  className="w-full px-3 py-2 text-sm border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                  rows={2}
                                />
                                <div className="flex items-center space-x-3 mt-2">
                                  <div className="flex-1">
                                    <label className="text-xs text-gray-600">Cảm xúc:</label>
                                    <select
                                      value={editedUserOpinion.sentiment || 'neutral'}
                                      onChange={(e) => updateUserOpinion('sentiment', e.target.value)}
                                      className="w-full px-2 py-1 text-sm border border-yellow-300 rounded-md focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    >
                                      <option value="positive">😊 Tích cực</option>
                                      <option value="neutral">😐 Trung tính</option>
                                      <option value="negative">😞 Tiêu cực</option>
                                    </select>
                                  </div>
                                  <div className="flex-1">
                                    <label className="text-xs text-gray-600">Độ thân: {((editedUserOpinion.closeness || 0) * 100).toFixed(0)}%</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.1"
                                      value={editedUserOpinion.closeness || 0}
                                      onChange={(e) => updateUserOpinion('closeness', parseFloat(e.target.value))}
                                      className="w-full h-2 bg-yellow-200 rounded-lg appearance-none cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Other Characters */}
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">👥 Về các nhân vật khác:</label>
                                {characters.filter(c => c.id !== editingCharId).map(otherChar => {
                                  const relation = editedRelations[otherChar.id] || { opinion: '', sentiment: 'neutral', closeness: 0 };
                                  return (
                                    <div key={otherChar.id} className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-2">
                                      <label className="block text-sm font-medium text-gray-700 mb-1">{otherChar.name}:</label>
                                      <textarea
                                        value={relation.opinion || ''}
                                        onChange={(e) => updateRelationOpinion(otherChar.id, 'opinion', e.target.value)}
                                        placeholder={`${editedName} nghĩ gì về ${otherChar.name}?`}
                                        className="w-full px-3 py-2 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        rows={2}
                                      />
                                      <div className="flex items-center space-x-3 mt-2">
                                        <div className="flex-1">
                                          <label className="text-xs text-gray-600">Cảm xúc:</label>
                                          <select
                                            value={relation.sentiment || 'neutral'}
                                            onChange={(e) => updateRelationOpinion(otherChar.id, 'sentiment', e.target.value)}
                                            className="w-full px-2 py-1 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                                          >
                                            <option value="positive">😊 Tích cực</option>
                                            <option value="neutral">😐 Trung tính</option>
                                            <option value="negative">😞 Tiêu cực</option>
                                          </select>
                                        </div>
                                        <div className="flex-1">
                                          <label className="text-xs text-gray-600">Độ thân: {((relation.closeness || 0) * 100).toFixed(0)}%</label>
                                          <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={relation.closeness || 0}
                                            onChange={(e) => updateRelationOpinion(otherChar.id, 'closeness', parseFloat(e.target.value))}
                                            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* AI Prompt Description Section */}
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                              AI Prompt (Tiếng Anh)
                            </label>
                            <button
                              type="button"
                              onClick={handleGeneratePrompt}
                              disabled={isGeneratingPrompt}
                              className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
                            >
                              {isGeneratingPrompt ? (
                                <>
                                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                  Đang tạo...
                                </>
                              ) : '🤖 Tạo bằng AI'}
                            </button>
                          </div>
                          <textarea
                            value={editedPromptDescription}
                            onChange={(e) => setEditedPromptDescription(e.target.value)}
                            placeholder="Để trống sẽ dùng mô tả mặc định từ tính cách..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            Mô tả ngắn gọn bằng tiếng Anh để AI hiểu nhân vật. Để trống = dùng mặc định.
                          </p>
                        </div>

                        <div className="flex justify-between items-center">
                          <button type="button" onClick={() => handlePreviewAudio(char.id, editedVoiceName, editedPitch, editedSpeakingRate)} disabled={isPreviewing !== null || isGeneratingPrompt} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50">Nghe thử</button>
                          <div className="flex space-x-2">
                            <button onClick={cancelEditing} disabled={isGeneratingPrompt} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50">Hủy</button>
                            <button onClick={saveChanges} disabled={isGeneratingPrompt} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50">Lưu</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start">
                       <div className="flex items-center h-full pt-1">
                          <input type="checkbox" id={`char-${char.id}`} checked={activeCharacterIds.includes(char.id)} onChange={() => handleToggleActive(char.id)} disabled={editingCharId !== null} className="h-5 w-5 rounded text-blue-500 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"/>
                      </div>
                      <label htmlFor={`char-${char.id}`} className={`ml-3 flex-1 ${editingCharId === null ? 'cursor-pointer' : 'cursor-default'}`}>
                        <p className="font-medium text-gray-800">{char.name} <span className="text-xs font-normal text-gray-400">({char.gender === 'female' ? 'Nữ' : 'Nam'}, {char.voiceName})</span></p>
                        <p className="text-sm text-gray-500">{char.personality}</p>
                      </label>
                      {editingCharId === null && (
                        <div className="flex items-center space-x-1 pl-2">
                          <button onClick={() => handlePreviewAudio(char.id, char.voiceName, char.pitch, char.speakingRate)} title="Nghe thử" disabled={isPreviewing !== null} className="text-gray-400 hover:text-green-500 p-1 rounded-full disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 100 12 6 6 0 000-12zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" /><path d="M10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zM9 12a1 1 0 112 0 1 1 0 01-2 0z" /></svg>
                          </button>
                          <button onClick={() => startEditing(char)} title="Sửa" className="text-gray-400 hover:text-blue-500 p-1 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L15.232 5.232z" /></svg>
                          </button>
                          {!isPredefined(char.id) && (
                            <button onClick={() => deleteCharacter(char.id)} title="Xóa" className="text-gray-400 hover:text-red-500 p-1 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {editingCharId === null && (
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Tạo nhân vật mới</h3>
              <form onSubmit={handleAddCharacter} className="space-y-3">
                <input type="text" placeholder="Tên nhân vật" value={newCharName} onChange={(e) => setNewCharName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                <textarea placeholder="Mô tả tính cách (ngắn gọn, bằng tiếng Anh)" value={newCharPersonality} onChange={(e) => setNewCharPersonality(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" rows={3}/>
                <textarea placeholder="Mô tả ngoại hình (để tạo ảnh)" value={newCharAppearance} onChange={(e) => setNewCharAppearance(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" rows={2}/>
                 <div className="flex items-center space-x-2">
                  <select value={newCharGender} onChange={(e) => setNewCharGender(e.target.value as 'male' | 'female')} className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                  </select>
                  <select value={newCharVoiceName} onChange={(e) => setNewCharVoiceName(e.target.value)} className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {AVAILABLE_VOICES.map(voice => <option key={voice.value} value={voice.value}>{voice.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-pitch" className="text-sm font-medium text-gray-700">Cao độ: {newCharPitch.toFixed(1)}</label>
                  <input id="new-pitch" type="range" min="-20" max="20" step="0.5" value={newCharPitch} onChange={(e) => setNewCharPitch(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div>
                  <label htmlFor="new-rate" className="text-sm font-medium text-gray-700">Tốc độ nói: {newCharSpeakingRate.toFixed(2)}x</label>
                  <input id="new-rate" type="range" min="0.25" max="4.0" step="0.05" value={newCharSpeakingRate} onChange={(e) => setNewCharSpeakingRate(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Avatar:</label>
                  <div className="flex items-center space-x-2 mt-1">
                    {newCharAvatar && <img src={newCharAvatar} alt="Avatar Preview" className="w-10 h-10 rounded-full object-cover" />}
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, true)} className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                    <button type="button" onClick={() => handlePreviewAudio('new', newCharVoiceName, newCharPitch, newCharSpeakingRate)} disabled={isPreviewing !== null} className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50">Nghe thử</button>
                    <button type="submit" className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:bg-green-300" disabled={!newCharName.trim() || !newCharPersonality.trim()}>
                      Thêm nhân vật
                    </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 text-right">
          <button onClick={onClose} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
