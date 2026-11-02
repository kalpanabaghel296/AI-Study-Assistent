
import { useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  ClipboardList,
  CalendarDays,
  Layers,
  Sparkles,
  BookOpen,
  Send,
  Upload,
  GraduationCap,
  Database,
  ArrowUpRight,
  Brain,
  Zap,
  Menu,
  X,
  Plus,
  Bot,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Bookmark,
  Trash2,
  History,
  MessageCircle
} from 'lucide-react';

const API =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

async function req(path, opts = {}) {
  const response = await fetch(API + path, opts);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (${response.status})`);
  }

  if (!response.ok) {
    const detail = data?.detail;

    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
          : detail && typeof detail === 'object'
            ? JSON.stringify(detail)
            : data?.message || 'Request failed';

    throw new Error(message);
  }

  return data;
}

const post = (data) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'AI Tutor', icon: MessageSquare },
  { name: 'PDF Learning', icon: FileText },
  { name: 'Quiz Generator', icon: ClipboardList },
  { name: 'Study Planner', icon: CalendarDays },
  { name: 'Flashcards', icon: Layers }
];


function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);
  const [renderError, setRenderError] = useState(false);
  const diagramId = `studymate-diagram-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!containerRef.current || !chart?.trim()) return;

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#10192c',
            primaryColor: '#29234c',
            primaryTextColor: '#f1edff',
            primaryBorderColor: '#9278f4',
            lineColor: '#9c8bea',
            secondaryColor: '#172d48',
            tertiaryColor: '#17243b',
            fontFamily: 'DM Sans, sans-serif'
          },
          flowchart: { curve: 'basis', htmlLabels: true }
        });

        const { svg } = await mermaid.render(diagramId, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRenderError(false);
        }
      } catch {
        if (!cancelled) setRenderError(true);
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [chart, diagramId]);

  return (
    <div className="visual-explanation">
      <div className="visual-explanation-heading">
        <span>VISUAL EXPLANATION</span>
        <span>StudyMate AI</span>
      </div>
      {renderError ? (
        <div className="diagram-fallback">
          Diagram could not be rendered. The explanation above is still available.
        </div>
      ) : (
        <div className="mermaid-canvas" ref={containerRef} />
      )}
    </div>
  );
}

function TutorMarkdown({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          return <>{children}</>;
        },
        code({ inline, className, children, ...props }) {
          const language = /language-(\w+)/.exec(className || '')?.[1];
          const source = String(children).replace(/\n$/, '');

          if (language === 'mermaid') {
            return <MermaidDiagram chart={source} />;
          }

          if (inline) {
            return <code className={className} {...props}>{children}</code>;
          }

          return (
            <pre>
              <code className={className} {...props}>{children}</code>
            </pre>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function PageHeading({ eyebrow, title, description }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-decoration">
        <Sparkles size={25} />
      </div>
    </div>
  );
}

function Panel({ children, className = '' }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function ResultPanel({ out }) {
  if (!out) return null;

  return (
    <Panel className="result-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">GENERATED CONTENT</span>
          <h2>Your Result</h2>
        </div>
        <Sparkles size={22} />
      </div>
      <pre>{JSON.stringify(out, null, 2)}</pre>
    </Panel>
  );
}



function DailyStickyNote() {
  const todayKey = (() => {
    const d = new Date();
    return `studymate-sticky-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  })();

  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(todayKey)) || {};
    } catch {
      return {};
    }
  });

  const [goal, setGoal] = useState(saved.goal || '');
  const [tasks, setTasks] = useState(saved.tasks || []);
  const [newTask, setNewTask] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [quickNote, setQuickNote] = useState(saved.quickNote || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );
  const [reminderError, setReminderError] = useState('');
  const [reminderLoading, setReminderLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      todayKey,
      JSON.stringify({ goal, tasks, quickNote })
    );
  }, [goal, tasks, quickNote, todayKey]);

  async function enableNotifications() {
  setReminderError('');

  if (!window.isSecureContext) {
    setReminderError('Notifications require HTTPS or localhost.');
    return;
  }

  if (!('Notification' in window)) {
    setReminderError('Your browser does not support notifications.');
    return;
  }

  if (Notification.permission === 'granted') {
    setNotificationsEnabled(true);
    new Notification('StudyMate AI 🔔', {
      body: 'Your study reminders are now enabled!'
    });
    return;
  }

  if (Notification.permission === 'denied') {
    setReminderError(
      'Notifications are blocked. Allow them in your browser site settings.'
    );
    return;
  }

  try {
    setReminderLoading(true);

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      setNotificationsEnabled(true);

      new Notification('StudyMate AI 🔔', {
        body: 'Great! Your study reminders are enabled.'
      });
    } else {
      setNotificationsEnabled(false);
      setReminderError(
        'Permission was not granted. Please allow notifications.'
      );
    }
  } catch (error) {
    console.error('Notification error:', error);
    setReminderError('Could not enable notifications. Check browser permissions.');
  } finally {
    setReminderLoading(false);
  }
}

  function addTask(e) {
    e.preventDefault();
    if (!newTask.trim()) return;

    setTasks(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        text: newTask.trim(),
        reminderAt: reminderTime,
        completed: false,
        notified: false
      }
    ]);

    setNewTask('');
    setReminderTime('');
  }

  function toggleTask(id) {
    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? { ...task, completed: !task.completed }
          : task
      )
    );
  }

  function deleteTask(id) {
    setTasks(prev => prev.filter(task => task.id !== id));
  }

  useEffect(() => {
    if (!notificationsEnabled) return;

    const check = () => {
      setTasks(prev => {
        let changed = false;

        const updated = prev.map(task => {
          if (
            !task.completed &&
            !task.notified &&
            task.reminderAt &&
            new Date(task.reminderAt).getTime() <= Date.now()
          ) {
            changed = true;

            new Notification('StudyMate Reminder 🔔', {
              body: `Time to do: ${task.text}`,
              tag: `task-${task.id}`
            });

            return { ...task, notified: true };
          }

          return task;
        });

        return changed ? updated : prev;
      });
    };

    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [notificationsEnabled]);

  const completed = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  const reminders = tasks
    .filter(t => t.reminderAt && !t.completed)
    .sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt));

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  return (
    <section className="sticky-board-section">
      <div className="sticky-board-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL SPACE</span>
          <h2>My Study Sticky Board <span>✦</span></h2>
          <p>Your goals, little reminders and daily wins — all in one place.</p>
        </div>

       <button
  type="button"
  className={`sticky-bell-button ${notificationsEnabled ? 'is-enabled' : ''}`}
  onClick={enableNotifications}
  disabled={reminderLoading}
>
  🔔 {
    reminderLoading
      ? 'Enabling...'
      : notificationsEnabled
        ? 'Reminders On'
        : 'Enable reminders'
  }
</button>

{reminderError && (
  <p className="reminder-error">
    {reminderError}
  </p>
)}
      </div>

      <div className="sticky-wall">
        {/* YELLOW GOAL NOTE */}
        <article className="wall-note note-yellow">
          <span className="note-pin pin-pink" />
          <div className="wall-note-top">
            <span>🎯 TODAY'S GOAL</span>
            <small>{dateLabel}</small>
          </div>

          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="What's your biggest goal today?"
            rows={5}
            aria-label="Today's main goal"
          />

          <div className="note-decoration">✦</div>
        </article>

        {/* PINK TASK NOTE */}
        <article className="wall-note note-pink">
          <span className="note-tape tape-pink" />
          <div className="wall-note-top">
            <span>☑ TODAY'S TASKS</span>
            <small>{pending} left</small>
          </div>

          <div className="wall-task-list">
            {tasks.length === 0 ? (
              <p className="wall-empty">Your task list is waiting for you!</p>
            ) : (
              tasks.map(task => (
                <div className="wall-task" key={task.id}>
                  <button
                    type="button"
                    className={`wall-checkbox ${task.completed ? 'checked' : ''}`}
                    onClick={() => toggleTask(task.id)}
                    aria-label="Toggle task"
                  >
                    {task.completed ? '✓' : ''}
                  </button>

                  <span className={task.completed ? 'wall-task-done' : ''}>
                    {task.text}
                  </span>

                  <button
                    type="button"
                    className="wall-task-delete"
                    onClick={() => deleteTask(task.id)}
                    aria-label="Delete task"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <form className="wall-add-form" onSubmit={addTask}>
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              placeholder="+ Add a task..."
              aria-label="New task"
            />

            <input
              type="datetime-local"
              value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              aria-label="Task reminder time"
              title="Optional reminder"
            />

            <button type="submit" disabled={!newTask.trim()}>
              Add
            </button>
          </form>
        </article>

        {/* BLUE REMINDER NOTE */}
        <article className="wall-note note-blue">
          <span className="note-clip" />
          <div className="wall-note-top">
            <span>🔔 REMINDERS</span>
            <small>{reminders.length} upcoming</small>
          </div>

          <div className="wall-reminder-list">
            {reminders.length === 0 ? (
              <p className="wall-empty">No reminders yet. Add a time to any task!</p>
            ) : (
              reminders.map(task => (
                <div className="wall-reminder" key={task.id}>
                  <span className="reminder-clock">◷</span>
                  <div>
                    <strong>
                      {new Date(task.reminderAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </strong>
                    <p>{task.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {/* GREEN PROGRESS NOTE */}
        <article className="wall-note note-green">
          <div className="wall-note-top">
            <span>📈 TODAY'S PROGRESS</span>
            <span className="progress-leaf">✿</span>
          </div>

          <div className="wall-progress-number">{progress}%</div>
          <p className="wall-progress-caption">
            {completed} of {tasks.length} tasks completed
          </p>

          <div className="wall-progress-track">
            <div
              className="wall-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="wall-progress-message">
            {progress === 100 && tasks.length > 0
              ? 'Amazing! All done today! 🎉'
              : progress >= 50
                ? 'You are doing great. Keep going!'
                : 'Every small step counts. 🌱'}
          </div>

          <div className="wall-progress-bottom">
            <span>{pending} pending</span>
            <span>{completed} done ✓</span>
          </div>
        </article>
      </div>

      <div className="sticky-board-footer">
        <span>✦ One task at a time. You've got this!</span>
        <span>Auto-saved ✓</span>
      </div>
    </section>
  );
}



export default function App() {
  const [page, setPage] = useState('Dashboard');
  const [db, setDb] = useState('checking');
  const [stats, setStats] = useState(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);

  const [topic, setTopic] = useState('');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizData, setQuizData] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [planData, setPlanData] = useState(null);
  const [flashcardsData, setFlashcardsData] = useState(null);
  const [currentCard, setCurrentCard] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [savedConversations, setSavedConversations] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);

  const [doc, setDoc] = useState('');
  const [question, setQuestion] = useState('');

  const [pdfAnswer, setPdfAnswer] = useState('');
  const [pdfChat, setPdfChat] = useState([]);
  const [uploadedFile, setUploadedFile] = useState('');

  const chatEndRef = useRef(null);
  const pdfAnswerRef = useRef(null);

  const [subjects, setSubjects] = useState(
    'Mathematics, Machine Learning'
  );
  const [date, setDate] = useState('');
  const [hours, setHours] = useState(3);
  const [planGoal, setPlanGoal] = useState('competitive_exam');
  const [goalName, setGoalName] = useState('');
  const [targetOutcome, setTargetOutcome] = useState('');
  const [currentLevel, setCurrentLevel] = useState('intermediate');
  const [completedTopics, setCompletedTopics] = useState('');
  const [weakTopics, setWeakTopics] = useState('');
  const [studyDays, setStudyDays] = useState('6');
  const [sessionLength, setSessionLength] = useState('90');
  const [routine, setRoutine] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  async function refresh() {
    try {
      await req('/api/health/db');
      setDb('connected');
      setStats(await req('/api/dashboard'));
    } catch {
      setDb('not connected');
    }
  }

  async function loadSavedPlans() {
    try { setSavedPlans(await req('/api/plans')); } catch (error) { console.error('Could not load saved plans:', error); }
  }

  async function loadSavedConversations() {
    try { setSavedConversations(await req('/api/tutor/conversations')); } catch (error) { console.error('Could not load conversations:', error); }
  }

  useEffect(() => {
    refresh();
    loadSavedPlans();
    loadSavedConversations();
  }, []);

  // Automatically scroll to the latest tutor message
useEffect(() => {
  chatEndRef.current?.scrollIntoView({
    behavior: 'smooth',
    block: 'end'
  });
}, [chat, busy]);

// Bring the latest PDF answer into view
useEffect(() => {
  if (pdfAnswer) {
    pdfAnswerRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }
}, [pdfAnswer]);

  async function run(fn) {
    setBusy(true);
    setErr('');
    setOut(null);

    try {
      await fn();
    } catch (error) {
      setErr(error.message || 'Something went wrong');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const field = (value, setter, placeholder, type = 'text') => (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setter(e.target.value)}
    />
  );

  function changePage(name) {
    setPage(name);
    setOut(null);
    setErr('');
    setMobileMenu(false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = msg.trim();
    if (!text || busy) return;
    setMsg('');
    const optimistic = [...chat, { role: 'You', content: text }];
    setChat(optimistic);

    await run(async () => {
      const response = await req('/api/tutor/chat', post({
        message: text,
        conversation_id: conversationId,
        history: chat.map((item) => ({
          role: item.role === 'You' ? 'user' : 'assistant',
          content: item.content
        }))
      }));
      setConversationId(response.conversation_id);
      setChat((previous) => [...previous, { role: 'Tutor', content: response.answer || 'No response received.' }]);
      await loadSavedConversations();
    });
  }

  async function openConversation(id) {
    await run(async () => {
      const data = await req(`/api/tutor/conversations/${id}`);
      setConversationId(data.id);
      setChat((data.messages || []).map((item) => ({
        role: item.role === 'user' ? 'You' : 'Tutor', content: item.content
      })));
    });
  }

  async function deleteConversation(id) {
    if (!window.confirm('Delete this conversation permanently?')) return;
    await run(async () => {
      await req(`/api/tutor/conversations/${id}`, { method: 'DELETE' });
      if (conversationId === id) { setConversationId(null); setChat([]); }
      await loadSavedConversations();
    });
  }

  function startNewConversation() {
    setConversationId(null);
    setChat([]);
    setMsg('');
    setErr('');
  }

  async function openPlan(id) {
    await run(async () => { setPlanData(await req(`/api/plans/${id}`)); });
  }

  async function deletePlan(id) {
    if (!window.confirm('Delete this saved study plan permanently?')) return;
    await run(async () => {
      await req(`/api/plans/${id}`, { method: 'DELETE' });
      if (planData?.id === id) setPlanData(null);
      await loadSavedPlans();
    });
  }

  const statCards = [
    {
      label: 'Documents',
      value: stats?.documents ?? '—',
      icon: FileText,
      color: 'purple',
      description: 'Learning resources'
    },
    {
      label: 'Quizzes',
      value: stats?.quizzes ?? '—',
      icon: ClipboardList,
      color: 'blue',
      description: 'Practice sessions'
    },
    {
      label: 'Study Plans',
      value: stats?.study_plans ?? '—',
      icon: CalendarDays,
      color: 'pink',
      description: 'Your schedules'
    },
    {
      label: 'Flashcards',
      value: stats?.flashcards ?? '—',
      icon: Layers,
      color: 'orange',
      description: 'Revision cards'
    }
  ];


  return (
    <div className="app">

      {/* MOBILE MENU BUTTON */}
      <button
        className="mobile-menu-button"
        onClick={() => setMobileMenu(!mobileMenu)}
        aria-label="Toggle navigation"
      >
        {mobileMenu ? <X /> : <Menu />}
      </button>

      {/* SIDEBAR */}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>

        <div className="brand">
          <div className="brand-icon">
            <GraduationCap size={24} />
          </div>
          <div>
            <h2>StudyMate<span> AI</span></h2>
            <small>YOUR LEARNING COMPANION</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => changePage(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {page === name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="database-card">
            <div className="database-icon">
              <Database size={17} />
            </div>
            <div>
              <strong>Database</strong>
              <small>
                <span className={`status-dot ${db === 'connected' ? 'online' : ''}`} />
                {db === 'connected' ? 'Connected' : db === 'checking' ? 'Checking...' : 'Disconnected'}
              </small>
            </div>
          </div>

          <div className="sidebar-profile">
            <div className="profile-avatar">S</div>
            <div>
              <strong>StudyMate</strong>
              <small>Personal Workspace</small>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-content">

        <div className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-status">
              <span className="status-dot online" />
              AI Assistant Ready
            </span>
            <div className="topbar-avatar">S</div>
          </div>
        </div>

        {/* DASHBOARD */}
        {page === 'Dashboard' && (
          <>
            
<section className="dashboard-welcome-card">
  <div className="dashboard-welcome-content">
    <span className="dashboard-welcome-tag">
      <Sparkles size={15} /> WELCOME BACK 👋
    </span>

    <h1>Your Personalized<br />Learning Hub</h1>

    <p>
      Plan, learn, practice and stay consistent — all in one place.
    </p>

    <div className="dashboard-welcome-actions">
      <button
        className="welcome-primary-button"
        onClick={() => changePage('AI Tutor')}
      >
        <BookOpen size={17} />
        Continue Learning
        <ArrowUpRight size={17} />
      </button>

      <button
        className="welcome-secondary-button"
        onClick={() => changePage('Study Planner')}
      >
        <CalendarDays size={18} />
        Create Study Plan
      </button>

      <button
        className="welcome-secondary-button"
        onClick={() => changePage('AI Tutor')}
      >
        <MessageSquare size={18} />
        Ask AI Tutor
      </button>
    </div>
  </div>

  <div className="dashboard-welcome-art">
    <div className="welcome-art-glow" />
    <div className="welcome-art-sparkle sparkle-one">✦</div>
    <div className="welcome-art-sparkle sparkle-two">✧</div>

    <div className="welcome-books">
      <div className="welcome-book book-purple" />
      <div className="welcome-book book-pink" />
      <div className="welcome-book book-blue" />
    </div>

    <div className="welcome-cap">
      <GraduationCap size={76} strokeWidth={1.7} />
    </div>
  </div>
</section>

{/* KEEP YOUR EXISTING STICKY NOTE COMPONENT HERE */}



            <DailyStickyNote />

            <div className="section-heading">
              <div>
                <span className="eyebrow">YOUR OVERVIEW</span>
                <h2>Learning Activity</h2>
              </div>
              <span className="overview-label">Workspace statistics</span>
            </div>

            <div className="stats-grid">
              {statCards.map((card) => {
                const Icon = card.icon;

                return (
                  <article className="stat-card" key={card.label}>
                    <div className={`stat-icon ${card.color}`}>
                      <Icon size={21} />
                    </div>
                    <div className="stat-value">{card.value}</div>
                    <h3>{card.label}</h3>
                    <p>{card.description}</p>
                  </article>
                );
              })}
            </div>

            <div className="section-heading">
              <div>
                <span className="eyebrow">QUICK ACCESS</span>
                <h2>Continue Learning</h2>
              </div>
            </div>

            <div className="quick-grid">
              {[
                {
                  title: 'Ask AI Tutor',
                  description: 'Get instant explanations',
                  icon: Bot,
                  page: 'AI Tutor'
                },
                {
                  title: 'Upload PDF',
                  description: 'Learn from your documents',
                  icon: Upload,
                  page: 'PDF Learning'
                },
                {
                  title: 'Practice Quiz',
                  description: 'Test your knowledge',
                  icon: ClipboardList,
                  page: 'Quiz Generator'
                }
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    className="quick-card"
                    key={item.title}
                    onClick={() => changePage(item.page)}
                  >
                    <Icon size={23} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* AI TUTOR */}
        {page === 'AI Tutor' && (
          <>
            <PageHeading
              eyebrow="YOUR PERSONAL AI ASSISTANT"
              title="AI Personal Tutor"
              description="Ask questions, explore concepts, and learn at your own pace."
            />

            <Panel className="tutor-panel">
              <div className="tutor-header">
                <div className="tutor-avatar">
                  <Bot size={25} />
                </div>
                <div>
                  <h2>StudyMate Assistant</h2>
                  <p><span className="status-dot online" /> Online · Powered by Groq</p>
                </div>
                <button
                  className="icon-button"
                  onClick={startNewConversation}
                  title="Start a new conversation"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="saved-conversations">
                <div className="saved-list-heading"><History size={16} /><strong>Previous conversations</strong><span>{savedConversations.length}</span></div>
                {savedConversations.length === 0 ? <p className="saved-empty">Your conversations will appear here automatically.</p> : (
                  <div className="saved-conversation-list">
                    {savedConversations.map((item) => (
                      <div className={`saved-conversation-item ${conversationId === item.id ? 'selected' : ''}`} key={item.id}>
                        <button className="saved-conversation-open" onClick={() => openConversation(item.id)} title={item.title}>
                          <MessageCircle size={15} /><span>{item.title || 'New conversation'}</span>
                        </button>
                        <button className="saved-delete-button" onClick={() => deleteConversation(item.id)} aria-label="Delete conversation" title="Delete conversation"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="chat">
                {chat.length === 0 && (
                  <div className="chat-welcome">
                    <div className="welcome-icon">
                      <Sparkles size={30} />
                    </div>
                    <h2>What would you like to learn today?</h2>
                    <p>
                      I'm here to help you understand complex topics
                      in a simple way.
                    </p>

                    <div className="suggestion-grid">
                      {[
                        'Explain neural networks simply',
                        'What is the difference between AI and ML?',
                        'Explain React Virtual DOM',
                        'How does a transformer work?'
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setMsg(suggestion)}
                        >
                          <Sparkles size={14} />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chat.map((message, index) => (
                  <div
                    key={index}
                    className={`chat-message ${
                      message.role === 'You' ? 'user-message' : 'assistant-message'
                    }`}
                  >
                    <div className="message-avatar">
                      {message.role === 'You' ? 'Y' : <Sparkles size={17} />}
                    </div>

                    <div className="message-body">
                      <div className="message-label">
                        {message.role === 'You' ? 'You' : 'StudyMate AI'}
                      </div>

                      <div className="message-content">
                        <TutorMarkdown content={message.content} />
                      </div>
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="chat-message assistant-message">
                    <div className="message-avatar">
                      <Sparkles size={17} />
                    </div>
                    <div className="message-body">
                      <div className="message-label">StudyMate AI</div>
                      <div className="typing-indicator">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Ask anything... e.g. Explain machine learning"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !msg.trim()}
                  aria-label="Send message"
                >
                  <Send size={19} />
                </button>
              </form>

              <p className="chat-disclaimer">
                <Zap size={13} /> AI can make mistakes. Verify important information.
              </p>
            </Panel>
          </>
        )}

        {/* PDF LEARNING */}
        
{/* PDF LEARNING */}
{page === 'PDF Learning' && (
  <>
    <PageHeading
      eyebrow="DOCUMENT INTELLIGENCE"
      title="PDF Learning"
      description="Upload your study material, ask questions and understand your documents with AI."
    />

    <Panel className="pdf-workspace">

      {/* Document upload */}
      <div className="pdf-upload-header">
        <div>
          <h2>Your learning document</h2>
          <p>Upload a PDF to start an interactive learning session.</p>
        </div>
        <FileText size={25} />
      </div>

      <label className="upload-area">
        <div className="upload-icon">
          <Upload size={28} />
        </div>

        <h3>
          {uploadedFile || 'Choose your PDF document'}
        </h3>

        <p>Click to browse and upload your study material</p>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.type !== 'application/pdf') {
              setErr('Please select a valid PDF file.');
              return;
            }

            setUploadedFile(file.name);
            setPdfAnswer('');
            setPdfChat([]);
            setDoc('');

            run(async () => {
              const fd = new FormData();
              fd.append('file', file);

              const response = await req(
                '/api/documents/upload',
                {
                  method: 'POST',
                  body: fd
                }
              );

              setDoc(response.document_id);
            });
          }}
        />
      </label>

      {doc && (
        <div className="uploaded-file">
          <div className="pdf-file-icon">
            <FileText size={20} />
          </div>

          <div>
            <strong>{uploadedFile || 'Your PDF document'}</strong>
            <small>Successfully uploaded and ready to study</small>
          </div>

          <span className="success-label">● Ready</span>
        </div>
      )}

      {/* Conversation history / answer */}
      <div className="pdf-answer-area">
        {pdfChat.length === 0 && !busy && (
          <div className="pdf-empty-state">
            <div className="empty-state-icon">
              <Sparkles size={25} />
            </div>
            <h3>Your document assistant is ready</h3>
            <p>
              Ask anything about your uploaded PDF. Your conversation
              will stay visible while you study this document.
            </p>
          </div>
        )}

        {pdfChat.map((message, index) => (
          <div
            className={`pdf-answer-card ${message.role === 'You' ? 'pdf-user-question' : ''}`}
            key={index}
            ref={index === pdfChat.length - 1 ? pdfAnswerRef : null}
          >
            <div className="pdf-answer-title">
              <div className="answer-avatar">
                {message.role === 'You' ? 'Y' : <Sparkles size={18} />}
              </div>
              <div>
                <strong>{message.role === 'You' ? 'You' : 'StudyMate AI'}</strong>
                <small>{message.role === 'You' ? 'Your question' : 'Answer from your document'}</small>
              </div>
            </div>
            <div className="message-content pdf-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {busy && (
          <div className="pdf-thinking">
            <Sparkles size={17} />
            Analyzing your document and preparing an answer...
          </div>
        )}
      </div>

      {/* Sticky question composer */}
      <form
        className="pdf-question-composer"
        onSubmit={(e) => {
          e.preventDefault();

          if (!doc || !question.trim() || busy) return;

          const currentQuestion = question.trim();
          setQuestion('');

          // Send all previous PDF questions and answers to the backend.
          const history = pdfChat.map((item) => ({
            role: item.role === 'You' ? 'user' : 'assistant',
            content: item.content
          }));

          setPdfChat((previous) => [
            ...previous,
            { role: 'You', content: currentQuestion }
          ]);

          run(async () => {
            const response = await req(
              '/api/documents/' + doc + '/ask',
              post({
                question: currentQuestion,
                history
              })
            );

            const answer = response.answer || 'No answer was returned.';
            setPdfAnswer(answer);
            setPdfChat((previous) => [
              ...previous,
              { role: 'Tutor', content: answer }
            ]);
          });
        }}
      >
        <label className="input-label">
          Ask your document
        </label>

        <div className="pdf-question-input">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your PDF..."
            disabled={!doc || busy}
          />

          <button
            type="submit"
            disabled={!doc || !question.trim() || busy}
            aria-label="Ask question"
          >
            {busy ? <Sparkles size={18} /> : <Send size={18} />}
          </button>
        </div>

        <small className="composer-hint">
          Press the send button to ask a question about your uploaded document.
        </small>
      </form>

    </Panel>
  </>
)}

        {/* QUIZ GENERATOR */}
        {page === 'Quiz Generator' && (
          <>
            <PageHeading
              eyebrow="TEST YOUR KNOWLEDGE"
              title="AI Quiz Generator"
              description="Generate a topic-based quiz, choose your answers and review explanations."
            />

            <Panel className="generator-panel">
              <div className="generator-icon blue"><ClipboardList size={28} /></div>
              <h2>Create your practice quiz</h2>
              <p>Choose a topic, difficulty and number of questions.</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!quizTopic.trim()) return;
                run(async () => {
                  const result = await req('/api/quizzes/generate', post({
                    topic: quizTopic.trim(),
                    number_of_questions: Number(quizCount),
                    difficulty: quizDifficulty
                  }));
                  setQuizData(result);
                  setSelectedAnswers({});
                  setQuizSubmitted(false);
                });
              }}>
                <label className="input-label">Quiz topic</label>
                {field(quizTopic, setQuizTopic, 'e.g. Machine Learning') }
                <label className="input-label">Number of questions</label>
                <select value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))}>
                  {[5, 8, 10, 15].map((n) => <option key={n} value={n}>{n} questions</option>)}
                </select>
                <label className="input-label">Difficulty</label>
                <select value={quizDifficulty} onChange={(e) => setQuizDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <button className="primary-button" disabled={busy || !quizTopic.trim()}>
                  Generate Quiz <Sparkles size={17} />
                </button>
              </form>
            </Panel>

            {quizData?.questions?.length > 0 && (
              <Panel className="result-panel quiz-result">
                <div className="section-title">
                  <div><span className="eyebrow">YOUR PRACTICE SESSION</span><h2>{quizData.title || 'Generated Quiz'}</h2></div>
                  <ClipboardList size={23} />
                </div>
                {quizData.questions.map((q, index) => (
                  <article className="quiz-question" key={index}>
                    <h3>{index + 1}. {q.question}</h3>
                    <div className="quiz-options">
                      {(q.options || []).map((option, optionIndex) => {
                        const isCorrect = quizSubmitted && optionIndex === q.answer_index;
                        const isWrong = quizSubmitted && selectedAnswers[index] === optionIndex && optionIndex !== q.answer_index;
                        return (
                          <button
                            type="button"
                            key={optionIndex}
                            className={`quiz-option ${selectedAnswers[index] === optionIndex ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'incorrect' : ''}`}
                            disabled={quizSubmitted}
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [index]: optionIndex }))}
                          >
                            <span>{String.fromCharCode(65 + optionIndex)}.</span> {option}
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && (
                      <div className="quiz-explanation">
                        <strong>{selectedAnswers[index] === q.answer_index ? 'Correct!' : `Correct answer: ${q.options?.[q.answer_index] ?? 'Not provided'}`}</strong>
                        {q.explanation && <p>{q.explanation}</p>}
                      </div>
                    )}
                  </article>
                ))}
                {!quizSubmitted ? (
                  <button className="primary-button" disabled={Object.keys(selectedAnswers).length !== quizData.questions.length} onClick={() => setQuizSubmitted(true)}>Submit answers</button>
                ) : (
                  <div className="quiz-score">
                    <h3>Your score: {quizData.questions.reduce((score, q, index) => score + (selectedAnswers[index] === q.answer_index ? 1 : 0), 0)} / {quizData.questions.length}</h3>
                    <button className="primary-button" onClick={() => { setSelectedAnswers({}); setQuizSubmitted(false); }}>Try again</button>
                  </div>
                )}
              </Panel>
            )}
          </>
        )}

        {/* STUDY PLANNER */}
        {page === 'Study Planner' && (
          <>
            <PageHeading
              eyebrow="YOUR ADAPTIVE LEARNING STRATEGIST"
              title="AI Study Planner"
              description="Tell StudyMate what you are preparing for, where you stand, and how you actually study. It will build a goal-specific roadmap."
            />

            <Panel className="planner-intro">
              <div className="planner-intro-icon"><Sparkles size={25} /></div>
              <div>
                <span className="eyebrow">MORE THAN A TIMETABLE</span>
                <h2>A plan that knows your purpose.</h2>
                <p>College exams, GATE and other competitive exams, placements, certifications or learning a new skill — the planner adapts its priorities to your goal.</p>
              </div>
            </Panel>

            <Panel className="planner-form-panel">
              <div className="planner-section-heading">
                <div><span className="eyebrow">STEP 1 · YOUR DESTINATION</span><h2>What are you preparing for?</h2></div>
                <span className="planner-step">01 / 03</span>
              </div>

              <div className="planner-goal-grid">
                {[
                  { value: 'college_exam', icon: '🎓', title: 'College / University', desc: 'Semester exams, midterms, backlogs' },
                  { value: 'competitive_exam', icon: '🏆', title: 'Competitive exam', desc: 'GATE, UPSC, CAT, JEE, NEET, etc.' },
                  { value: 'school_exam', icon: '📚', title: 'School / Board', desc: 'Boards, school tests, subjects' },
                  { value: 'placement', icon: '💼', title: 'Placements / Interview', desc: 'DSA, aptitude, technical rounds' },
                  { value: 'certification', icon: '📜', title: 'Certification', desc: 'Course modules and certification tests' },
                  { value: 'skill_learning', icon: '🚀', title: 'Learn a skill', desc: 'Projects, practice and portfolio' }
                ].map((item) => (
                  <button type="button" key={item.value}
                    className={`planner-goal-card ${planGoal === item.value ? 'selected' : ''}`}
                    onClick={() => setPlanGoal(item.value)}>
                    <span className="planner-goal-emoji">{item.icon}</span>
                    <span><strong>{item.title}</strong><small>{item.desc}</small></span>
                    <span className="planner-radio">{planGoal === item.value ? '✓' : ''}</span>
                  </button>
                ))}
              </div>

              <form className="planner-form" onSubmit={(e) => {
                e.preventDefault();
                if (!date || !subjects.trim() || !goalName.trim()) return;
                run(async () => {
                  const result = await req('/api/plans/generate', post({
                    goal_type: planGoal,
                    goal_name: goalName.trim(),
                    target_outcome: targetOutcome.trim(),
                    subjects: subjects.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
                    exam_date: date,
                    hours_per_day: Number(hours),
                    current_level: currentLevel,
                    completed_topics: completedTopics.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
                    weak_topics: weakTopics.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
                    study_days_per_week: Number(studyDays),
                    session_minutes: Number(sessionLength),
                    routine,
                    extra_context: extraContext.trim()
                  }));
                  setPlanData(result);
                  await loadSavedPlans();
                });
              }}>
                <div className="planner-section-heading">
                  <div><span className="eyebrow">STEP 2 · DEFINE THE TARGET</span><h2>Give your goal some detail</h2></div>
                  <span className="planner-step">02 / 03</span>
                </div>

                <div className="planner-fields-grid">
                  <label className="planner-field planner-field-wide">
                    <span>{planGoal === 'college_exam' ? 'Course / semester / exam name' : planGoal === 'competitive_exam' ? 'Which competitive exam?' : planGoal === 'placement' ? 'Target role / hiring preparation' : planGoal === 'certification' ? 'Certification / course name' : planGoal === 'school_exam' ? 'Board / class / exam name' : 'What skill do you want to learn?'}</span>
                    <input value={goalName} onChange={(e) => setGoalName(e.target.value)}
                      placeholder={planGoal === 'competitive_exam' ? 'e.g. GATE DA 2027' : planGoal === 'college_exam' ? 'e.g. B.Tech Semester 7' : planGoal === 'placement' ? 'e.g. Software Engineer / AI-ML role' : planGoal === 'certification' ? 'e.g. AWS Cloud Practitioner' : planGoal === 'school_exam' ? 'e.g. CBSE Class 12 Boards' : 'e.g. Machine Learning from basics'} required />
                  </label>
                  <label className="planner-field">
                    <span>{planGoal === 'skill_learning' ? 'Target outcome' : 'Target score / outcome (optional)'}</span>
                    <input value={targetOutcome} onChange={(e) => setTargetOutcome(e.target.value)}
                      placeholder={planGoal === 'competitive_exam' ? 'e.g. 80+ marks / top rank' : planGoal === 'placement' ? 'e.g. Crack product-based company interviews' : 'e.g. 8+ CGPA / complete a project'} />
                  </label>
                  <label className="planner-field">
                    <span>{planGoal === 'skill_learning' ? 'Target completion date' : 'Exam / interview / deadline'}</span>
                    <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} required />
                  </label>
                  <label className="planner-field planner-field-wide">
                    <span>{planGoal === 'placement' ? 'Subjects / skills to prepare' : planGoal === 'skill_learning' ? 'Topics / skills you want to cover' : 'Subjects / papers / modules'}</span>
                    <textarea rows="3" value={subjects} onChange={(e) => setSubjects(e.target.value)}
                      placeholder="Separate items with commas. Example: DSA, DBMS, Operating Systems, Aptitude" required />
                    <small>List your subjects or topics, separated by commas. You can add chapters or units too.</small>
                  </label>
                </div>

                <div className="planner-section-heading planner-subsection-heading">
                  <div><span className="eyebrow">STEP 3 · YOUR CURRENT POSITION</span><h2>What do you already know?</h2></div>
                  <span className="planner-step">03 / 03</span>
                </div>
                <div className="planner-fields-grid">
                  <label className="planner-field">
                    <span>Your current preparation level</span>
                    <select value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)}>
                      <option value="beginner">Beginner — starting from scratch</option>
                      <option value="intermediate">Intermediate — know the basics</option>
                      <option value="advanced">Advanced — revision and practice</option>
                      <option value="mixed">Mixed — varies by subject</option>
                    </select>
                  </label>
                  <label className="planner-field">
                    <span>Study hours available per day</span>
                    <input type="number" min="1" max="16" value={hours} onChange={(e) => setHours(e.target.value)} required />
                  </label>
                  <label className="planner-field planner-field-wide">
                    <span>Topics you have already completed (optional)</span>
                    <textarea rows="2" value={completedTopics} onChange={(e) => setCompletedTopics(e.target.value)}
                      placeholder="e.g. Probability, Python basics, Linear Regression" />
                  </label>
                  <label className="planner-field planner-field-wide">
                    <span>Topics you find difficult / weak in (optional)</span>
                    <textarea rows="2" value={weakTopics} onChange={(e) => setWeakTopics(e.target.value)}
                      placeholder="e.g. Linear Algebra, SQL joins, numerical questions" />
                  </label>
                </div>

                <div className="planner-routine-box">
                  <div><span className="eyebrow">MAKE IT FIT YOUR REAL ROUTINE</span><h3>Your weekly study rhythm</h3></div>
                  <div className="planner-fields-grid">
                    <label className="planner-field">
                      <span>Days you can study each week</span>
                      <select value={studyDays} onChange={(e) => setStudyDays(e.target.value)}>
                        <option value="3">3 days</option><option value="4">4 days</option><option value="5">5 days</option><option value="6">6 days</option><option value="7">7 days</option>
                      </select>
                    </label>
                    <label className="planner-field">
                      <span>Preferred session length</span>
                      <select value={sessionLength} onChange={(e) => setSessionLength(e.target.value)}>
                        <option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option>
                      </select>
                    </label>
                    <label className="planner-field planner-field-wide">
                      <span>College / work timings or preferred study slots (optional)</span>
                      <input value={routine} onChange={(e) => setRoutine(e.target.value)} placeholder="e.g. College 9 AM–4 PM; prefer studying after 6 PM" />
                    </label>
                    <label className="planner-field planner-field-wide">
                      <span>Anything else the AI should consider? (optional)</span>
                      <textarea rows="2" value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="e.g. I need more time for maths, weekends are free, include weekly mock tests..." />
                    </label>
                  </div>
                </div>

                <div className="planner-submit-row">
                  <p><Sparkles size={15} /> Your plan will include priorities, weekly milestones, daily tasks, revision and practice — not just a timetable.</p>
                  <button className="primary-button" type="submit" disabled={busy || !date || !subjects.trim() || !goalName.trim()}>
                    {busy ? 'Building your roadmap...' : 'Generate my smart study plan'} <ArrowUpRight size={17} />
                  </button>
                </div>
              </form>
            </Panel>

            <Panel className="saved-plans-panel">
              <div className="section-title"><div><span className="eyebrow">YOUR LIBRARY</span><h2>Saved study plans</h2></div><Bookmark size={21} /></div>
              {savedPlans.length === 0 ? <p className="saved-empty">Your generated study plans will be saved here automatically.</p> : (
                <div className="saved-plan-list">
                  {savedPlans.map((item) => (
                    <div className={`saved-plan-item ${planData?.id === item.id ? 'selected' : ''}`} key={item.id}>
                      <button className="saved-plan-open" onClick={() => openPlan(item.id)}>
                        <CalendarDays size={17} /><span><strong>{item.title || 'Study plan'}</strong><small>{(item.subjects || []).join(', ')} · {item.goal_name || item.goal_type || 'Study plan'} · Deadline: {item.exam_date || 'Not specified'}</small></span>
                      </button>
                      <button className="saved-delete-button" onClick={() => deletePlan(item.id)} title="Delete study plan" aria-label="Delete study plan"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {planData?.weeks?.length > 0 && (
              <Panel className="result-panel study-plan-result">
                <div className="section-title">
                  <div><span className="eyebrow">YOUR PERSONALIZED ROADMAP</span><h2>{planData.title || 'Your Study Plan'}</h2></div>
                  <CalendarDays size={23} />
                </div>
                <div className="study-plan-summary">
                  <h2>{planData.goal_name || goalName}</h2>
                  <p>{planData.summary}</p>
                  <div className="planner-result-meta">
                    <span>{planData.goal_type?.replaceAll('_', ' ') || planGoal.replaceAll('_', ' ')}</span>
                    <span>Deadline: {planData.exam_date || date}</span>
                    <span>{planData.hours_per_day || hours} hrs/day</span>
                  </div>
                </div>
                {planData.strategy && <div className="planner-strategy"><h3><Brain size={17} /> AI strategy</h3><p>{planData.strategy}</p></div>}
                {Array.isArray(planData.priority_reasons) && planData.priority_reasons.length > 0 && (
                  <div className="planner-priorities"><h3>Why these topics are prioritized</h3><ul>{planData.priority_reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div>
                )}
                {Array.isArray(planData.milestones) && planData.milestones.length > 0 && (
                  <div className="planner-milestones"><h3>Roadmap milestones</h3><div className="planner-milestone-grid">{planData.milestones.map((item, i) => <article key={i}><strong>{item.title || `Milestone ${i + 1}`}</strong><p>{item.description || item.goal || ''}</p></article>)}</div></div>
                )}
                {planData.weeks.map((week, weekIndex) => (
                  <section className="plan-week" key={weekIndex}>
                    <div className="planner-week-heading"><div><span className="eyebrow">WEEK {weekIndex + 1}</span><h3>{week.week || `Week ${weekIndex + 1}`}</h3></div><span>{week.focus}</span></div>
                    <div className="plan-task-list">
                      {(week.tasks || []).map((task, taskIndex) => (
                        <article className="plan-task" key={taskIndex}>
                          <div><strong>{task.day || `Day ${taskIndex + 1}`}</strong><span>{task.subject || 'Study session'}</span></div>
                          <h4>{task.topic || task.task || 'Study topic'}</h4>
                          {task.task && <p>{task.task}</p>}
                          {task.why && <small className="planner-why">Why: {task.why}</small>}
                          <small>{task.duration_hours ?? '—'} hours</small>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
                {Array.isArray(planData.revision_strategy) && planData.revision_strategy.length > 0 && (
                  <div className="planner-priorities"><h3>Revision & practice system</h3><ul>{planData.revision_strategy.map((item, i) => <li key={i}>{typeof item === 'string' ? item : item.description || item.task}</li>)}</ul></div>
                )}
              </Panel>
            )}
          </>
        )}

        {/* FLASHCARDS */}
        {page === 'Flashcards' && (
          <>
            <PageHeading
              eyebrow="SMART REVISION"
              title="Flashcards"
              description="Create, flip and review AI-powered cards to remember concepts faster."
            />

            <Panel className="generator-panel flashcard-generator">
              <div className="flashcard-generator-row">
                <div className="flashcard-generator-label">
                  <div className="generator-icon orange"><Layers size={25} /></div>
                  <div>
                    <h2>Create a revision deck</h2>
                    <p>Enter a topic and StudyMate AI will prepare your flashcards.</p>
                  </div>
                </div>
                <form
                  className="flashcard-generator-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!topic.trim()) return;

                    run(async () => {
                      const result = await req(
                        '/api/flashcards/generate',
                        post({ topic: topic.trim(), count: 8 })
                      );
                      setFlashcardsData(result);
                      setCurrentCard(0);
                      setCardFlipped(false);
                    });
                  }}
                >
                  <label className="input-label" htmlFor="flashcard-topic">Topic</label>
                  <input
                    id="flashcard-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Neural Networks"
                  />
                  <button className="primary-button" disabled={busy || !topic.trim()}>
                    <Sparkles size={17} /> Generate Flashcards
                  </button>
                </form>
              </div>
            </Panel>

            {flashcardsData?.cards?.length > 0 && (
              <Panel className="flashcards-result">
                <div className="flashcards-deck-top">
                  <div className="flashcards-deck-title">
                    <div className="flashcards-deck-icon"><Layers size={25} /></div>
                    <div>
                      <span className="eyebrow">ACTIVE REVISION DECK</span>
                      <h2>{flashcardsData.topic || topic}</h2>
                      <p>{flashcardsData.cards.length} cards · Review at your own pace</p>
                    </div>
                  </div>
                  <div className="flashcards-progress-wrap">
                    <div className="flashcards-progress-track">
                      <div
                        className="flashcards-progress-fill"
                        style={{ width: `${((currentCard + 1) / flashcardsData.cards.length) * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(((currentCard + 1) / flashcardsData.cards.length) * 100)}%</span>
                  </div>
                  <div className="flashcards-count-pill">
                    Card {currentCard + 1} of {flashcardsData.cards.length}
                  </div>
                </div>

                <div className="flashcard-stage">
                  <div className="flashcard-stack-shadow flashcard-stack-shadow-back" />
                  <div className="flashcard-stack-shadow flashcard-stack-shadow-front" />
                  <button
                    type="button"
                    className={`flashcard-scene ${cardFlipped ? 'is-flipped' : ''}`}
                    onClick={() => setCardFlipped((value) => !value)}
                    aria-label={cardFlipped ? 'Show question' : 'Flip card to reveal answer'}
                    aria-pressed={cardFlipped}
                  >
                    <span className="flashcard-rotator">
                      <span className="flashcard-face flashcard-face-front">
                        <span className="flashcard-face-topline">
                          <span className="flashcard-kind"><span className="flashcard-kind-icon">?</span> QUESTION</span>
                          <Bookmark size={22} />
                        </span>
                        <span className="flashcard-main-text">
                          {flashcardsData.cards[currentCard]?.front}
                        </span>
                        <span className="flashcard-flip-hint">
                          <RotateCcw size={16} /> Click the card to flip and see the answer
                        </span>
                        <span className="flashcard-decoration" />
                      </span>

                      <span className="flashcard-face flashcard-face-back">
                        <span className="flashcard-face-topline">
                          <span className="flashcard-kind answer-kind"><span className="flashcard-kind-icon">✓</span> ANSWER</span>
                          <Bookmark size={22} />
                        </span>
                        <span className="flashcard-main-text">
                          {flashcardsData.cards[currentCard]?.back}
                        </span>
                        <span className="flashcard-flip-hint">
                          <RotateCcw size={16} /> Click the card to return to the question
                        </span>
                        <span className="flashcard-decoration answer-decoration" />
                      </span>
                    </span>
                  </button>
                </div>

                <div className="flashcard-navigation">
                  <button
                    type="button"
                    className="flashcard-nav-button"
                    disabled={currentCard === 0}
                    onClick={() => {
                      setCurrentCard((n) => Math.max(0, n - 1));
                      setCardFlipped(false);
                    }}
                  >
                    <ChevronLeft size={18} /> Previous
                  </button>
                  <button
                    type="button"
                    className="flashcard-nav-button flashcard-flip-button"
                    onClick={() => setCardFlipped((value) => !value)}
                  >
                    <RotateCcw size={17} /> {cardFlipped ? 'Show Question' : 'Flip Card'}
                  </button>
                  <button
                    type="button"
                    className="flashcard-nav-button"
                    disabled={currentCard === flashcardsData.cards.length - 1}
                    onClick={() => {
                      setCurrentCard((n) => Math.min(flashcardsData.cards.length - 1, n + 1));
                      setCardFlipped(false);
                    }}
                  >
                    Next <ChevronRight size={18} />
                  </button>
                </div>
                <p className="flashcard-study-tip">
                  <Sparkles size={14} /> Tip: Try answering the question before flipping the card.
                </p>
              </Panel>
            )}
          </>
        )}

        {/* ERROR */}
        {err && (
          <div className="error">
            <strong>Something went wrong</strong>
            <p>{err}</p>
          </div>
        )}

        {/* LOADING */}
        {busy && page !== 'AI Tutor' && (
          <div className="loading">
            <Sparkles size={18} /> StudyMate AI is preparing your result...
          </div>
        )}

        {/* GENERATED RESULT */}
        <ResultPanel out={out} />

        <footer className="main-footer">
          <span>✦ StudyMate AI</span>
          <span>Made for smarter learning.</span>
        </footer>

      </main>
    </div>
  );
}
