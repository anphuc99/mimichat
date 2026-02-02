// Simple HTTP service with JWT auth support
// Usage example:
// import http from './services/HTTPService';
// await http.login(clientToken); // stores jwt
// const data = await http.get('/');

export const API_URL = {
    LOGIN: '/login',
    
    API_LOGIN: '/api/login',
    API_VERIFY: '/api/verify',
	API_GET_API_KEY: '/api/get-api-key',
	API_DATA: '/api/data',
	API_AUDIO: '/api/audio',
    API_AVATAR: '/api/avatar',
	API_UPLOAD_AUDIO: '/api/upload-audio',
    API_UPLOAD_AVATAR: '/api/upload-avatar',
    API_UPLOAD_IMAGE_MESSAGE: '/api/upload-image-message',
	API_SAVE_DATA: '/api/save-data',
	API_TTS: '/api/text-to-speech',
    // ElevenLabs API
    API_ELEVENLABS_VOICES: '/api/elevenlabs/voices',
    API_VOICE_PREVIEW: '/api/voice-preview',
    // Story APIs
    API_STORIES: '/api/stories',
    API_STORY: '/api/story',
    // Streak API (separate from stories)
    API_STREAK: '/api/streak',
    // Vocabulary Collection APIs
    API_VOCABULARY: '/api/vocabulary',
    API_VOCABULARY_COLLECTION: '/api/vocabulary-collection',
    // Global Vocabulary Store API
    API_VOCABULARY_STORE: '/api/vocabulary-store',
    // Daily Tasks Configuration API
    API_DAILY_TASKS: '/api/daily-tasks',
};

export interface HttpResponse<T = any> {
	ok: boolean;
	status: number;
	data?: T;
	error?: string;
}

class HTTPService {
	private baseUrl: string;
	private storageKey = 'jwt';

	constructor() {
		// Check if in development mode (Vite dev server) or production (built)
		const isDev = (import.meta as any).env?.DEV;
		
		if (isDev) {
			console.log("Using development server URL for HTTPService");
			// Development: use localhost server
			this.baseUrl = (import.meta as any).env?.VITE_API_BASE;
		} else {
			// Production: use current origin or environment variable			
			this.baseUrl = window.location.origin;
		}
	}

	setBaseUrl(url: string) {
		this.baseUrl = url.replace(/\/$/, '');
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	getToken(): string | null {
		return localStorage.getItem(this.storageKey);
	}

	isAuthenticated(): boolean {
		return !!this.getToken();
	}

	logout(): void {
		localStorage.removeItem(this.storageKey);
	}

	private authHeaders(): Record<string, string> {
		const token = this.getToken();
		return token ? { Authorization: `Bearer ${token}` } : {};
	}

	private async request<T>(method: string, path: string, body?: any, includeAuth: boolean = true): Promise<HttpResponse<T>> {
		const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (includeAuth) Object.assign(headers, this.authHeaders());
		try {
			const res = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
			});
			const text = await res.text();
			let parsed: any;
			try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = text; } // Return raw text if JSON parse fails
			if (!res.ok) {
				return { ok: false, status: res.status, error: (typeof parsed === 'object' ? parsed?.error : undefined) || text || 'Request failed' };
			}
			return { ok: true, status: res.status, data: parsed };
		} catch (e: any) {
			return { ok: false, status: 0, error: e.message || 'Network error' };
		}
	}

	public async downloadFile(path: string): Promise<Blob | null> {
		const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		const headers: Record<string, string> = this.authHeaders();
		try {
			const res = await fetch(url, { headers });
			if (!res.ok) return null;
			const blob = await res.blob();
			return blob;
		}
		catch {
			return null;
		}
	}

	async login(clientToken: string): Promise<HttpResponse<{ accessToken: string }>> {
		// Use API login endpoint
		const res = await this.request<{ accessToken: string }>('POST', API_URL.API_LOGIN, { token: clientToken }, false);
		if (res.ok && res.data?.accessToken) {
			localStorage.setItem(this.storageKey, res.data.accessToken);
		}
		return res;
	}

	async verify(): Promise<HttpResponse> {
		return this.request('GET', '/api/verify');
	}

	async get<T = any>(path: string): Promise<HttpResponse<T>> {
		return this.request<T>('GET', path);
	}

	async post<T = any>(path: string, body: any): Promise<HttpResponse<T>> {
		return this.request<T>('POST', path, body);
	}

	async put<T = any>(path: string, body: any): Promise<HttpResponse<T>> {
		return this.request<T>('PUT', path, body);
	}

	async delete<T = any>(path: string): Promise<HttpResponse<T>> {
		return this.request<T>('DELETE', path);
	}
}

const http = new HTTPService();
export default http;
