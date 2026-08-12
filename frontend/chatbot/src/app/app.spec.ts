import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the Tan welcome experience', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Bring the world');
    expect(compiled.querySelector('[data-testid="message-bubble"]')?.textContent).toContain("I'm Tan");
  });

  it('uses Cultural Infusion branding and has no source-link UI', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('header img')?.getAttribute('alt')).toBe('Cultural Infusion');
    expect(compiled.textContent).not.toContain('Authorised sample');
    expect(compiled.textContent).not.toContain('Sources');
  });

  it('shows live dependency readiness instead of assuming the model is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/health/ready')) {
        return new Response(JSON.stringify({ status: 'ready' }), { status: 200 });
      }
      return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }));
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Assistant ready');
  });

  it('switches to the manager agent preview', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.authUser.set({ id: 'manager-1', role: 'manager', label: 'Manager' });
    fixture.componentInstance.selectAgent('manager');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="agent-name"]')?.textContent).toContain('Manager Agent');
    expect(compiled.querySelector('[data-testid="message-bubble"]')?.textContent).toContain('Manager Agent preview');
  });

  it('keeps pending requests and responses isolated to their originating agent', async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ authenticated: false }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => { resolveRequest = resolve; });
    }));

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.authUser.set({ id: 'manager-1', role: 'manager', label: 'Manager' });
    const pendingTanRequest = app.send('Find me a program');

    expect(app.isLoading()).toBe(true);
    expect(app.isAgentLoading('tan')).toBe(true);

    app.selectAgent('manager');
    expect(app.isLoading()).toBe(false);
    expect(app.messages()).toHaveLength(1);
    expect(app.messages()[0]?.content).toContain('Manager Agent preview');

    resolveRequest(new Response(JSON.stringify({
      conversationId: 'tan-conversation',
      agentKey: 'tan',
      message: { id: 'tan-reply', content: 'A Tan response', createdAt: new Date().toISOString() },
      programs: [],
      suggestions: [],
      generation: { provider: 'ollama', model: 'test-model' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await pendingTanRequest;

    expect(app.activeAgentKey()).toBe('manager');
    expect(app.messages()).toHaveLength(1);
    expect(app.isLoading()).toBe(false);

    app.selectAgent('tan');
    expect(app.messages().map((message) => message.content)).toEqual([
      expect.stringContaining("I'm Tan"),
      'Find me a program',
      'A Tan response',
    ]);
    expect(app.isLoading()).toBe(false);
  });

  it('renders streamed progress before revealing the validated answer', async () => {
    const encoder = new TextEncoder();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      if (!String(input).endsWith('/api/public/chat')) {
        return Promise.resolve(new Response(JSON.stringify({ authenticated: false, status: 'ready' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          controller.enqueue(encoder.encode(`${JSON.stringify({
            type: 'progress', stage: 'understanding', label: 'Understanding your request',
            detail: 'Checking the request against approved knowledge',
          })}\n`));
        },
      }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } }));
    }));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const pending = app.send('Help me choose a program');
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(app.progress()?.stage).toBe('understanding');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="response-progress"]')?.textContent).toContain('Understanding your request');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[aria-label="Stop generating response"]')).toHaveLength(2);

    stream.enqueue(encoder.encode(`${JSON.stringify({
      type: 'result',
      data: {
        conversationId: 'stream-conversation', agentKey: 'tan',
        message: { id: 'stream-reply', content: 'A validated answer', createdAt: new Date().toISOString() },
        programs: [], suggestions: [], generation: { provider: 'ollama', model: 'qwen3:14b' },
      },
    })}\n`));
    stream.close();
    await pending;

    expect(app.progress()).toBeNull();
    expect(app.messages().at(-1)?.content).toBe('A validated answer');
  });

  it('hides internal agents until a role is authenticated', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.visibleAgents().map((agent) => agent.key)).toEqual(['tan']);
    app.authUser.set({ id: 'manager-1', role: 'manager', label: 'Manager' });
    expect(app.visibleAgents().map((agent) => agent.key)).toEqual(['tan', 'manager']);
    app.authUser.set({ id: 'staff-1', role: 'business_user', label: 'Business staff' });
    expect(app.visibleAgents().map((agent) => agent.key)).toEqual(['tan', 'business']);
  });

  it('authenticates a manager and reveals only the manager workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/login')) {
        return new Response(JSON.stringify({
          authenticated: true,
          user: { id: 'manager-1', role: 'manager', label: 'Manager' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.updateAuthEmail('manager@demo.local');
    app.updateAuthPassword('manager-demo');

    await app.signIn();

    expect(app.authUser()?.role).toBe('manager');
    expect(app.activeAgentKey()).toBe('manager');
    expect(app.visibleAgents().map((agent) => agent.key)).toEqual(['tan', 'manager']);
  });

  it('rejects a response that belongs to a different agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/public/chat')) {
        return new Response(JSON.stringify({
          conversationId: 'wrong-agent-conversation',
          agentKey: 'manager',
          message: { id: 'wrong-agent-reply', content: 'Wrong response', createdAt: new Date().toISOString() },
          programs: [], suggestions: [], generation: { provider: 'ollama' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ authenticated: false, status: 'ready' }), { status: 200 });
    }));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    await app.send('Find a program');

    expect(app.messages().map((message) => message.content)).not.toContain('Wrong response');
    expect(app.error()).toMatch(/invalid response/i);
  });

  it('returns to public access and opens sign in when a staff session expires', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/internal/chat')) {
        return new Response(JSON.stringify({ message: 'The staff session is invalid or expired.' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ authenticated: false, status: 'ready' }), { status: 200 });
    }));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.authUser.set({ id: 'manager-1', role: 'manager', label: 'Manager' });
    app.selectAgent('manager');

    await app.send('Show pending approvals');

    expect(app.authUser()).toBeNull();
    expect(app.activeAgentKey()).toBe('tan');
    expect(app.authDialogOpen()).toBe(true);
    expect(app.authError()).toMatch(/expired/i);
  });
});
