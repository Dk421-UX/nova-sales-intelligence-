import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { Sparkles, Send, X, ShieldCheck, Database, ArrowRight, CornerDownLeft, Bot } from 'lucide-react';

interface AskNovaAIProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectSlug?: string;
  projectName?: string;
  onSelectPropertyByNumber?: (plotNumber: string) => void;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  executedTools?: string[];
  verifiedData?: any;
  timestamp: string;
}

export const AskNovaAI: React.FC<AskNovaAIProps> = ({
  isOpen,
  onClose,
  currentProjectSlug,
  projectName,
  onSelectPropertyByNumber
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hi! I'm Nova AI, your property assistant.\n\nI can help you explore Nova projects, find currently available properties, compare properties, and understand official project information.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputValue).trim();
    if (!textToSend || isLoading) return;

    const userMsg: MessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.text }));
      const res = await api.askNova(history, currentProjectSlug);

      const aiMsg: MessageItem = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        text: res.answer,
        executedTools: res.executedTools,
        verifiedData: res.verifiedData,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: 'I could not retrieve the property details right now. Please try again or browse properties directly using the layout viewer.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'Show available East-facing properties',
    'What amenities are in this project?',
    'Show inventory availability summary',
    'Show properties above 1500 sq.ft'
  ];

  return (
    <div 
      className="ask-nova-drawer"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        width: '420px',
        maxWidth: 'calc(100vw - 2rem)',
        height: '620px',
        maxHeight: 'calc(100vh - 4rem)',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 999,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div 
        style={{
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, #18202c 0%, #10151f 100%)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div 
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(212, 175, 55, 0.2)',
              border: '1px solid var(--brand-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-gold)',
              flexShrink: 0
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: '1rem', color: '#fff', margin: 0, fontWeight: 600 }}>Ask Nova AI</h4>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>Verified Property Discovery</span>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose} 
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Close Ask Nova AI"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          overflowX: 'hidden',
          padding: '1.25rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem' 
        }}
      >
        {messages.map(m => {
          const isUser = m.role === 'user';
          return (
            <div 
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}
            >
              <div 
                style={{
                  background: isUser ? 'var(--brand-gold)' : 'var(--bg-surface-raised)',
                  color: isUser ? '#0a0d12' : 'var(--text-primary)',
                  fontWeight: isUser ? 600 : 400,
                  padding: '0.85rem 1rem',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  border: isUser ? 'none' : '1px solid var(--border-subtle)',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere'
                }}
              >
                {m.text}
              </div>

              {/* Clean Customer Verification Badge */}
              {m.role === 'assistant' && m.id !== 'welcome' && (
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <span 
                    style={{
                      fontSize: '0.65rem',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: 'var(--status-available)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.1rem 0.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <ShieldCheck size={11} /> Grounded in Published Records
                  </span>
                </div>
              )}

              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                {m.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div style={{ alignSelf: 'flex-start', background: 'var(--bg-surface-raised)', padding: '0.75rem 1rem', borderRadius: '14px 14px 14px 2px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={16} color="var(--brand-gold)" className="animate-spin" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Querying verified database records...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div 
        style={{ 
          padding: '0.6rem 1rem', 
          display: 'flex', 
          gap: '0.4rem', 
          overflowX: 'auto', 
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            style={{
              whiteSpace: 'nowrap',
              fontSize: '0.72rem',
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-full)',
              padding: '0.35rem 0.75rem',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        style={{ 
          padding: '0.75rem 1rem', 
          borderTop: '1px solid var(--border-subtle)', 
          display: 'flex', 
          gap: '0.5rem', 
          background: 'var(--bg-surface-raised)',
          flexShrink: 0 
        }}
      >
        <input
          type="text"
          placeholder="Ask about facing, dimensions, availability..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          style={{ flex: 1, padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
          disabled={isLoading}
        />
        <button 
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!inputValue.trim() || isLoading}
          style={{ padding: '0.6rem 0.9rem' }}
          aria-label="Send Message"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
};
