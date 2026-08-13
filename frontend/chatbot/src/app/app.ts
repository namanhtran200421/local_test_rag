import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, HostListener, OnInit, signal, ViewChild, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface ProgramMatch {
  id: string;
  title?: string;
  summary: string;
  audience: string;
  availability: string;
  theme: string;
  bookingUrl: string;
  imageTone: 'coral' | 'gold' | 'teal' | 'violet';
}

interface ApiResponse {
  conversationId: string;
  agentKey: AgentKey;
  message: { id: string; content: string; createdAt: string };
  programs: ProgramMatch[];
  suggestions: string[];
  generation: { provider: 'ollama' | 'deterministic'; model?: string };
}

type ProgressStage = 'connecting' | 'understanding' | 'generating' | 'verifying';

interface PendingResponse {
  stage: ProgressStage;
  label: string;
  detail: string;
  elapsedSeconds: number;
}

class ChatResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type AgentKey = 'tan' | 'manager';
type InternalRole = 'manager';

interface AuthUser {
  id: string;
  role: InternalRole;
  label: string;
}

interface AuthResponse {
  authenticated: boolean;
  user?: AuthUser;
}

interface AgentDefinition {
  key: AgentKey;
  shortName: string;
  name: string;
  subtitle: string;
  eyebrow: string;
  title: [string, string];
  description: string;
  badge: string;
  welcome: string;
  prompts: string[];
}

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  programs?: ProgramMatch[];
  generation?: { provider: 'ollama' | 'deterministic'; model?: string };
}

interface AgentSession {
  messages: WritableSignal<UiMessage[]>;
  conversationId: WritableSignal<string | null>;
  suggestions: WritableSignal<string[]>;
  isLoading: WritableSignal<boolean>;
  progress: WritableSignal<PendingResponse | null>;
  error: WritableSignal<string | null>;
  retryableError: WritableSignal<boolean>;
  draft: WritableSignal<string>;
  requestSerial: number;
  controller?: AbortController;
  cancelledByUser: boolean;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

  readonly agents: AgentDefinition[] = [
    {
      key: 'tan',
      shortName: 'Public',
      name: 'Tan',
      subtitle: 'Program & curriculum guide',
      eyebrow: 'Education assistant',
      title: ['Bring the world', 'into your classroom.'],
      description: 'Explore culturally rich school programs and grounded Australian curriculum connections.',
      badge: 'Public knowledge',
      welcome: "Hi, I'm Tan. I can help you find culturally rich school programs and connect them to the Australian curriculum. What are you planning?",
      prompts: [
        'Explore programs available in Victoria',
        'Explore First Nations experiences',
        'Show music and dance programs',
      ],
    },
    {
      key: 'manager',
      shortName: 'Bob',
      name: 'Bob',
      subtitle: 'Cultural Infusion Atlas guide',
      eyebrow: 'Internal Atlas assistant',
      title: ['Explore the Atlas.', 'Ask Bob anything.'],
      description: 'Search across Cultural Infusion Atlas website content, including page text, image descriptions, resources and research papers.',
      badge: 'Internal access · demo',
      welcome: "Hi, I'm Bob. I can help with anything published in the Cultural Infusion Atlas—from site pages and image descriptions to resources and research papers. What would you like to find?",
      prompts: [
        'What can I explore in the Atlas?',
        'Summarise the Atlas research methodology',
        'Explain an Atlas map or image',
      ],
    },
  ];
  private readonly sessions: Record<AgentKey, AgentSession> = {
    tan: this.createSession('tan'),
    manager: this.createSession('manager'),
  };

  readonly activeAgentKey = signal<AgentKey>('tan');
  readonly activeAgent = computed(() => this.agentFor(this.activeAgentKey()));
  readonly authUser = signal<AuthUser | null>(null);
  readonly authReady = signal(false);
  readonly authDialogOpen = signal(false);
  readonly authEmail = signal('');
  readonly authPassword = signal('');
  readonly authLoading = signal(false);
  readonly authError = signal<string | null>(null);
  readonly serviceStatus = signal<'checking' | 'ready' | 'unavailable'>('checking');
  readonly visibleAgents = computed(() => {
    const role = this.authUser()?.role;
    const internalKey: AgentKey | undefined = role === 'manager' ? 'manager' : undefined;
    return this.agents.filter((agent) => agent.key === 'tan' || agent.key === internalKey);
  });
  readonly starterPrompts = computed(() => this.activeAgent().prompts);
  readonly messages = computed(() => this.activeSession().messages());
  readonly isFreshConversation = computed(() => this.messages().length === 1);
  readonly suggestions = computed(() => this.activeSession().suggestions());
  readonly isLoading = computed(() => this.activeSession().isLoading());
  readonly progress = computed(() => this.activeSession().progress());
  readonly error = computed(() => this.activeSession().error());
  readonly retryableError = computed(() => this.activeSession().retryableError());
  readonly characterCount = computed(() => this.draft().length);
  readonly draft = computed(() => this.activeSession().draft());

  private createSession(key: AgentKey): AgentSession {
    return {
      messages: signal([this.welcomeMessage(key)]),
      conversationId: signal(null),
      suggestions: signal([...this.agentFor(key).prompts]),
      isLoading: signal(false),
      progress: signal(null),
      error: signal(null),
      retryableError: signal(false),
      draft: signal(''),
      requestSerial: 0,
      cancelledByUser: false,
    };
  }

  private activeSession(): AgentSession {
    return this.sessions[this.activeAgentKey()];
  }

  private withoutYearLevelHints(values: string[]): string[] {
    return values.filter((value) => !/\byear(?:\s*|-)?level\b|\byear\s*(?:[1-9]|1[0-2])\b/i.test(value));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.authDialogOpen()) this.closeSignIn();
  }

  ngOnInit(): void {
    void this.restoreAuth();
    void this.checkServiceStatus();
  }

  private async checkServiceStatus(): Promise<void> {
    try {
      const response = await fetch('/health/ready', { credentials: 'same-origin' });
      const data = (await response.json().catch(() => null)) as { status?: string } | null;
      this.serviceStatus.set(response.ok && data?.status === 'ready' ? 'ready' : 'unavailable');
    } catch {
      this.serviceStatus.set('unavailable');
    }
  }

  private agentFor(key: AgentKey): AgentDefinition {
    return this.agents.find((agent) => agent.key === key)!;
  }

  private welcomeMessage(key: AgentKey): UiMessage {
    return {
      id: `welcome-${key}`,
      role: 'assistant',
      content: this.agentFor(key).welcome,
    };
  }

  selectAgent(key: AgentKey): void {
    if (!this.canAccessAgent(key)) return;
    if (key === this.activeAgentKey()) return;
    this.activeAgentKey.set(key);
    window.setTimeout(() => {
      this.messageInput?.nativeElement.focus();
      this.scrollToLatest();
    }, 0);
  }

  updateDraft(value: string): void {
    this.activeSession().draft.set(value.slice(0, 2000));
  }

  isAgentLoading(key: AgentKey): boolean {
    return this.sessions[key].isLoading();
  }

  private canAccessAgent(key: AgentKey): boolean {
    if (key === 'tan') return true;
    const role = this.authUser()?.role;
    return key === 'manager' && role === 'manager';
  }

  private async restoreAuth(): Promise<void> {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Unable to restore the staff session.');
      const data = (await response.json()) as AuthResponse;
      const user = data.authenticated && this.isAuthUser(data.user) ? data.user : null;
      this.authUser.set(user);
    } catch {
      this.authUser.set(null);
    } finally {
      this.authReady.set(true);
    }
  }

  private isAuthUser(value: unknown): value is AuthUser {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<AuthUser>;
    return typeof candidate.id === 'string'
      && typeof candidate.label === 'string'
      && candidate.role === 'manager';
  }

  private isApiResponse(value: unknown, agentKey: AgentKey): value is ApiResponse {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ApiResponse>;
    return candidate.agentKey === agentKey
      && typeof candidate.conversationId === 'string'
      && !!candidate.message
      && typeof candidate.message.id === 'string'
      && typeof candidate.message.content === 'string'
      && Array.isArray(candidate.programs)
      && Array.isArray(candidate.suggestions);
  }

  private isProgressStage(value: unknown): value is Exclude<ProgressStage, 'connecting'> {
    return value === 'understanding' || value === 'generating' || value === 'verifying';
  }

  private async readChatResponse(
    response: Response,
    agentKey: AgentKey,
    session: AgentSession,
    requestSerial: number,
  ): Promise<unknown> {
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
      return response.json();
    }
    if (!response.body) throw new Error('The assistant returned an empty response. Please try again.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: unknown;

    const consumeLine = (line: string): void => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event['type'] === 'heartbeat') return;
      if (event['type'] === 'progress'
        && this.isProgressStage(event['stage'])
        && typeof event['label'] === 'string'
        && typeof event['detail'] === 'string') {
        if (requestSerial !== session.requestSerial) return;
        const current = session.progress();
        session.progress.set({
          stage: event['stage'],
          label: event['label'].slice(0, 90),
          detail: event['detail'].slice(0, 140),
          elapsedSeconds: current?.elapsedSeconds ?? 0,
        });
        if (this.activeAgentKey() === agentKey) window.setTimeout(() => this.scrollToLatest(), 0);
        return;
      }
      if (event['type'] === 'error') {
        throw new ChatResponseError(
          typeof event['message'] === 'string' ? event['message'] : 'The assistant could not complete that response.',
          typeof event['status'] === 'number' ? event['status'] : 500,
        );
      }
      if (event['type'] === 'result') result = event['data'];
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
    if (!result) throw new Error('The assistant response ended unexpectedly. Please try again.');
    return result;
  }

  openSignIn(): void {
    this.authError.set(null);
    this.authDialogOpen.set(true);
  }

  closeSignIn(): void {
    if (!this.authLoading()) this.authDialogOpen.set(false);
  }

  onAuthBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeSignIn();
  }

  updateAuthEmail(value: string): void {
    this.authEmail.set(value.slice(0, 254));
  }

  updateAuthPassword(value: string): void {
    this.authPassword.set(value.slice(0, 256));
  }

  async signIn(): Promise<void> {
    if (this.authLoading() || !this.authEmail().trim() || !this.authPassword()) return;
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: this.authEmail().trim(), password: this.authPassword() }),
      });
      const data = (await response.json().catch(() => null)) as (AuthResponse & { message?: string }) | null;
      if (!response.ok || !data?.authenticated || !this.isAuthUser(data.user)) {
        throw new Error(data?.message ?? 'Sign-in failed.');
      }
      this.authUser.set(data.user);
      this.authPassword.set('');
      this.authDialogOpen.set(false);
      this.selectAgent('manager');
    } catch (loginError) {
      this.authError.set(loginError instanceof Error ? loginError.message : 'Sign-in failed.');
    } finally {
      this.authLoading.set(false);
    }
  }

  async signOut(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      this.resetSession('manager');
      this.authUser.set(null);
      this.activeAgentKey.set('tan');
      window.setTimeout(() => this.messageInput?.nativeElement.focus(), 0);
    }
  }

  async send(suggestedMessage?: string): Promise<void> {
    const agentKey = this.activeAgentKey();
    const session = this.sessions[agentKey];
    if (!this.canAccessAgent(agentKey)) return;
    const content = (suggestedMessage ?? session.draft()).trim();
    if (!content || session.isLoading()) return;

    session.draft.set('');
    session.error.set(null);
    session.retryableError.set(false);
    session.suggestions.set([]);
    session.messages.update((messages) => [
      ...messages,
      { id: crypto.randomUUID(), role: 'user', content },
    ]);
    session.isLoading.set(true);
    session.cancelledByUser = false;
    session.progress.set({
      stage: 'connecting',
      label: 'Starting a response',
      detail: 'Connecting securely to the local assistant',
      elapsedSeconds: 0,
    });

    const controller = new AbortController();
    const requestSerial = ++session.requestSerial;
    session.controller = controller;
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    const elapsedTimer = window.setInterval(() => {
      if (requestSerial !== session.requestSerial) return;
      session.progress.update((current) => current
        ? { ...current, elapsedSeconds: current.elapsedSeconds + 1 }
        : current);
    }, 1_000);
    let retryable = true;

    try {
      const agent = this.agentFor(agentKey);
      const isPublic = agent.key === 'tan';
      const response = await fetch(isPublic ? '/api/public/chat' : '/api/internal/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/x-ndjson',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...(session.conversationId() ? { conversationId: session.conversationId() } : {}),
          message: content,
          ...(!isPublic ? { agentKey: agent.key } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        retryable = response.status >= 500 || response.status === 429 || response.status === 404;
        if (response.status === 401 && !isPublic) {
          this.resetSession('manager');
          this.authUser.set(null);
          this.activeAgentKey.set('tan');
          this.openSignIn();
          this.authError.set('Your staff session expired. Please sign in again.');
          throw new Error('Your staff session expired. Please sign in again.');
        }
        if (response.status === 404) session.conversationId.set(null);
        if (response.status >= 500) this.serviceStatus.set('unavailable');
        throw new Error(body?.message ?? 'Tan is unavailable right now.');
      }

      const data: unknown = await this.readChatResponse(response, agentKey, session, requestSerial);
      if (!this.isApiResponse(data, agentKey)) throw new Error('The assistant returned an invalid response. Please try again.');
      if (requestSerial !== session.requestSerial) return;
      session.conversationId.set(data.conversationId);
      this.serviceStatus.set('ready');
      session.suggestions.set(this.withoutYearLevelHints(data.suggestions));
      session.messages.update((messages) => [
        ...messages,
        {
          id: data.message.id,
          role: 'assistant',
          content: data.message.content,
          programs: data.programs,
          generation: data.generation,
        },
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof DOMException && requestError.name === 'AbortError'
          ? session.cancelledByUser
            ? 'Response stopped. You can retry when you’re ready.'
            : 'That took longer than expected. Please try again.'
          : requestError instanceof Error
            ? requestError.message
            : 'Tan is unavailable right now. Please try again.';
      if (requestSerial !== session.requestSerial) return;
      if (requestError instanceof ChatResponseError) {
        retryable = requestError.status >= 500 || requestError.status === 429 || requestError.status === 404;
        if (requestError.status === 404) session.conversationId.set(null);
        if (requestError.status >= 500) this.serviceStatus.set('unavailable');
      }
      session.error.set(message);
      session.retryableError.set(retryable);
      session.suggestions.set(retryable ? [content] : []);
    } finally {
      window.clearTimeout(timeout);
      window.clearInterval(elapsedTimer);
      if (requestSerial === session.requestSerial) {
        session.controller = undefined;
        session.isLoading.set(false);
        session.progress.set(null);
        if (this.activeAgentKey() === agentKey) {
          window.setTimeout(() => this.scrollToLatest(), 0);
        }
      }
    }
  }

  stopResponse(): void {
    const session = this.activeSession();
    if (!session.isLoading() || !session.controller) return;
    session.cancelledByUser = true;
    session.controller.abort();
  }

  retryLastMessage(): void {
    const session = this.activeSession();
    const retryContent = session.suggestions()[0];
    if (!retryContent || session.isLoading()) return;
    session.messages.update((messages) => {
      const last = messages.at(-1);
      return last?.role === 'user' && last.content === retryContent ? messages.slice(0, -1) : messages;
    });
    void this.send(retryContent);
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  startOver(): void {
    const agentKey = this.activeAgentKey();
    this.resetSession(agentKey);
    window.setTimeout(() => this.messageInput?.nativeElement.focus(), 0);
  }

  private resetSession(agentKey: AgentKey): void {
    const session = this.sessions[agentKey];
    session.controller?.abort();
    session.controller = undefined;
    session.requestSerial += 1;
    session.conversationId.set(null);
    session.messages.set([this.welcomeMessage(agentKey)]);
    session.suggestions.set([...this.agentFor(agentKey).prompts]);
    session.isLoading.set(false);
    session.progress.set(null);
    session.cancelledByUser = false;
    session.error.set(null);
    session.retryableError.set(false);
    session.draft.set('');
  }

  private scrollToLatest(): void {
    document.querySelector('.typing, .message:last-of-type')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }
}
