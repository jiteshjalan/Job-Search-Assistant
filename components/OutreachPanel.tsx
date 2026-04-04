'use client';

import { useState, useEffect, useRef } from 'react';
import type { ScoredJob } from '@/app/api/score-jobs/route';
import type { Contact } from '@/app/api/find-contacts/route';

interface Props {
  job: ScoredJob;
  onClose: () => void;
}

type Tab = 'email' | 'linkedin';

type SendResult = { address: string; success: boolean; error?: string };

const DEFAULT_TEMPLATES = {
  warm: {
    name: 'Warm (mutual connection)',
    subject: 'Introduction via [Mutual Connection] — [Your Name]',
    body: `Hi [Name],

[Mutual Connection] suggested I reach out — they thought our paths might be worth crossing given my background in [relevant area] and your work at [Company].

I've been following [Company]'s growth closely, particularly [specific thing]. I'm currently exploring [role type] opportunities and think there could be a strong fit for a few reasons: [reason 1], [reason 2].

Would you be open to a 20-minute call? Happy to work around your schedule.

Best,
[Your Name]`,
  },
  coldHiring: {
    name: 'Cold — Hiring Manager',
    subject: 'Re: [Role Title] at [Company] — [Your Name]',
    body: `Hi [Name],

I came across the [Role Title] at [Company] and wanted to reach out directly.

My background spans [key experience 1] and [key experience 2], most recently at [Previous Company] where I [key achievement]. I've been drawn to [Company] because [specific reason tied to their work or stage].

I know you're likely fielding a lot of interest. I'll keep this brief: I think I can contribute meaningfully to [specific goal/challenge] and would welcome a quick conversation to see if there's a fit.

Best,
[Your Name]`,
  },
  coldPeer: {
    name: 'Cold — Peer (referral ask)',
    subject: 'Quick question about [Company]',
    body: `Hi [Name],

I noticed we're both in the [industry/function] space — I'm reaching out because I'm seriously considering the [Role Title] at [Company] and wanted to get a genuine inside perspective before applying formally.

No pressure at all, but if you've got 10 minutes for a quick chat about what it's like to work there, I'd really appreciate it. Happy to return the favour in any way I can.

Thanks,
[Your Name]`,
  },
};

const TEMPLATES_KEY = 'jsa_email_templates';

function loadTemplates() {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
  try {
    const saved = localStorage.getItem(TEMPLATES_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function saveTemplates(t: typeof DEFAULT_TEMPLATES) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
}

// UTF-8 safe base64 for text content
function textToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
}

export default function OutreachPanel({ job, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('email');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState<keyof typeof DEFAULT_TEMPLATES | null>(null);

  // Per-contact email edits
  const [emailEdits, setEmailEdits] = useState<Record<string, { subject: string; body: string }>>({});
  // Per-contact recipient selection: { [contactId]: string[] }
  const [selectedEmails, setSelectedEmails] = useState<Record<string, string[]>>({});
  // Per-contact manual email input
  const [manualEmail, setManualEmail] = useState<Record<string, string>>({});
  // Per-contact send state
  const [sendingIds,  setSendingIds]  = useState<Set<string>>(new Set());
  const [sendResults, setSendResults] = useState<Record<string, SendResult[]>>({});
  // Gmail auth
  const [gmailAuthUrl, setGmailAuthUrl] = useState<string | null>(null);

  // CV attachment
  const [optimisedCVText, setOptimisedCVText] = useState<string | null>(null);
  const [cvAttached,      setCvAttached]      = useState(true);
  const [manualCVPdf, setManualCVPdf] = useState<{ filename: string; base64: string } | null>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);

  // Per-contact LinkedIn state
  const [linkedinEdits, setLinkedinEdits] = useState<Record<string, {
    connection: string; followUp1: string; followUp2: string;
  }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load templates
  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  // Fetch optimised CV for this job on mount
  useEffect(() => {
    fetch(`/api/send-email?jobId=${encodeURIComponent(job.id)}`)
      .then((r) => r.json())
      .then((data: { optimisedCV?: string | null }) => {
        if (data.optimisedCV) setOptimisedCVText(data.optimisedCV);
      })
      .catch(() => {});
  }, [job.id]);

  const fetchContacts = async () => {
    const cvText = localStorage.getItem('jsa_cv') ?? '';
    setLoadingContacts(true);
    setFetchError('');
    try {
      const res = await fetch('/api/find-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: job.company, jobTitle: job.title, cvText, jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const fetched: Contact[] = data.contacts;
      setContacts(fetched);

      const sig = localStorage.getItem('emailSignature') ?? '';
      const sigBlock = sig.trim() ? `\n\n--\n${sig.trim()}` : '';

      const emailInit: typeof emailEdits = {};
      const liInit: typeof linkedinEdits = {};
      const selInit: typeof selectedEmails = {};
      fetched.forEach((c) => {
        emailInit[c.id] = { subject: c.draftEmail.subject, body: c.draftEmail.body + sigBlock };
        liInit[c.id] = {
          connection: c.linkedinConnectionRequest,
          followUp1: c.linkedinFollowUp1,
          followUp2: c.linkedinFollowUp2,
        };
        // Default: all predicted emails selected
        selInit[c.id] = c.predictedEmails ?? [];
      });
      setEmailEdits(emailInit);
      setLinkedinEdits(liInit);
      setSelectedEmails(selInit);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to find contacts');
    } finally {
      setLoadingContacts(false);
    }
  };

  const applyTemplate = (contactId: string, tKey: keyof typeof DEFAULT_TEMPLATES) => {
    const t = templates[tKey];
    setEmailEdits((prev) => ({ ...prev, [contactId]: { subject: t.subject, body: t.body } }));
  };

  const toggleEmail = (contactId: string, email: string) => {
    setSelectedEmails((prev) => {
      const cur = prev[contactId] ?? [];
      const next = cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email];
      return { ...prev, [contactId]: next };
    });
  };

  const handleManualCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.readAsDataURL(file);
    });
    setManualCVPdf({ filename: file.name, base64: b64 });
    e.target.value = '';
  };

  const handleSendEmail = async (contactId: string) => {
    const edit = emailEdits[contactId];
    if (!edit) return;

    const recipients = [
      ...(selectedEmails[contactId] ?? []),
      ...(manualEmail[contactId]?.trim() ? [manualEmail[contactId].trim()] : []),
    ];
    if (!recipients.length) {
      setSendResults((prev) => ({
        ...prev,
        [contactId]: [{ address: '—', success: false, error: 'No recipients selected' }],
      }));
      return;
    }

    // Build attachment
    let attachment: { filename: string; base64: string; mimeType: string } | undefined;
    if (optimisedCVText && cvAttached) {
      attachment = {
        filename: 'Optimised CV.txt',
        base64: textToBase64(optimisedCVText),
        mimeType: 'text/plain',
      };
    } else if (manualCVPdf) {
      attachment = { ...manualCVPdf, mimeType: 'application/pdf' };
    }

    setSendingIds((prev) => new Set([...prev, contactId]));
    setSendResults((prev) => { const n = { ...prev }; delete n[contactId]; return n; });

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipients, subject: edit.subject, body: edit.body, attachment }),
      });
      const data = await res.json() as {
        results?: SendResult[];
        needsAuth?: boolean;
        authUrl?: string;
        error?: string;
      };

      if (data.needsAuth && data.authUrl) {
        setGmailAuthUrl(data.authUrl);
      } else if (data.results) {
        setSendResults((prev) => ({ ...prev, [contactId]: data.results! }));
        // Fix 3: track outreach send in sheet if at least one address succeeded
        if (data.results.some(r => r.success)) {
          fetch('/api/track-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId:   job.id,
              company: job.company,
              title:   job.title,
              url:     job.url ?? '',
              status:  'Outreach Sent',
              score:   job.compositeScore,
            }),
          }).catch(() => {});
        }
      } else {
        setSendResults((prev) => ({
          ...prev,
          [contactId]: [{ address: '—', success: false, error: data.error ?? 'Unknown error' }],
        }));
      }
    } catch {
      setSendResults((prev) => ({
        ...prev,
        [contactId]: [{ address: '—', success: false, error: 'Failed to send' }],
      }));
    } finally {
      setSendingIds((prev) => { const n = new Set([...prev]); n.delete(contactId); return n; });
    }
  };

  const handleCopyLinkedIn = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const updateTemplate = (key: keyof typeof DEFAULT_TEMPLATES, field: 'subject' | 'body', value: string) => {
    const updated = { ...templates, [key]: { ...templates[key], [field]: value } };
    setTemplates(updated);
    saveTemplates(updated);
  };

  const contactSentSuccessfully = (contactId: string) =>
    (sendResults[contactId] ?? []).some((r) => r.success);

  // ---------------------------------------------------------------------------
  // Attachment section (shared across all contacts)
  // ---------------------------------------------------------------------------
  function renderAttachmentSection() {
    if (optimisedCVText) {
      return (
        <div className="flex items-center justify-between bg-emerald-500/[0.07] border border-emerald-500/[0.15] rounded-lg px-3 py-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-[11px]">📄</span>
            <div>
              <p className="text-[11px] font-medium text-emerald-300">Optimised CV attached</p>
              <p className="text-[10px] text-emerald-400/50">Built for {job.company}</p>
            </div>
          </div>
          <button
            onClick={() => setCvAttached((v) => !v)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
              cvAttached
                ? 'border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
                : 'border-white/[0.08] text-[#555] hover:text-[#888]'
            }`}
          >
            {cvAttached ? 'Remove' : 'Re-attach'}
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.07] rounded-lg px-3 py-2 mb-4">
        <input ref={cvFileRef} type="file" accept=".pdf" className="hidden" onChange={handleManualCVUpload} />
        {manualCVPdf ? (
          <>
            <span className="text-[11px] text-[#888] flex-1 truncate">📎 {manualCVPdf.filename}</span>
            <button
              onClick={() => setManualCVPdf(null)}
              className="text-[10px] text-red-500/50 hover:text-red-400 cursor-pointer"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-[#444] flex-1">No optimised CV for this role</span>
            <button
              onClick={() => cvFileRef.current?.click()}
              className="text-[10px] text-indigo-400/70 hover:text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
            >
              Attach PDF
            </button>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="panel-slide">
      {/* Header */}
      <div className="sticky top-0 bg-[#141414] border-b border-white/[0.08] px-5 py-4 flex items-center justify-between z-10">
        <div>
          <h2 className="font-semibold text-[#e0e0e0]">Outreach Centre</h2>
          <p className="text-[11px] text-[#555] mt-0.5">{job.title} · {job.company}</p>
        </div>
        <button onClick={onClose} className="text-[#444] hover:text-[#888] cursor-pointer text-lg leading-none transition-colors">✕</button>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.07] px-5 flex gap-0">
        {(['email', 'linkedin'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium cursor-pointer border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[#444] hover:text-[#888]'
            }`}
          >
            {t === 'email' ? 'Email Outreach' : 'LinkedIn Outreach'}
          </button>
        ))}
      </div>

      <div className="px-5 py-4">
        {/* Gmail auth banner */}
        {gmailAuthUrl && (
          <div className="flex items-center justify-between bg-amber-500/[0.08] border border-amber-500/[0.15] rounded-xl px-4 py-3 mb-4">
            <div>
              <p className="text-[12px] font-medium text-amber-300">Gmail not connected</p>
              <p className="text-[10px] text-amber-400/60 mt-0.5">Authorise once to send emails directly from the app</p>
            </div>
            <a
              href={gmailAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setGmailAuthUrl(null)}
              className="ml-4 flex-shrink-0 text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Connect Gmail
            </a>
          </div>
        )}

        {/* Find contacts CTA */}
        {contacts.length === 0 && !loadingContacts && (
          <div className="text-center py-10">
            <p className="text-sm text-[#555] mb-1">
              Searches LinkedIn via SerpApi to find real people at {job.company}, then Gemma drafts personalised outreach.
            </p>
            <p className="text-[11px] text-[#3a3a3a] mb-6">No API credits used until you click.</p>
            <button
              onClick={fetchContacts}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl cursor-pointer transition-colors"
            >
              Find Contacts at {job.company}
            </button>
            {fetchError && <p className="text-red-400/80 text-xs mt-3">{fetchError}</p>}
          </div>
        )}

        {loadingContacts && (
          <div className="text-center py-12">
            <div className="score-bar max-w-[200px] mx-auto mb-3">
              <div className="score-bar-fill bg-indigo-500" style={{ width: '100%', animation: 'indeterminate 2s ease-in-out infinite' }} />
            </div>
            <p className="text-sm text-[#555]">Searching LinkedIn + drafting with Gemma…</p>
          </div>
        )}

        {/* EMAIL TAB */}
        {tab === 'email' && contacts.length > 0 && (
          <div className="space-y-5">
            {/* CV attachment (shared) */}
            {renderAttachmentSection()}

            {/* Templates */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-semibold text-[#333] uppercase tracking-widest">Saved Templates</h3>
                {editingTemplate && (
                  <button onClick={() => setEditingTemplate(null)} className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer">
                    Done
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {(Object.keys(templates) as (keyof typeof DEFAULT_TEMPLATES)[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setEditingTemplate(editingTemplate === key ? null : key)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                      editingTemplate === key
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#666] hover:border-white/[0.14] hover:text-[#999]'
                    }`}
                  >
                    {templates[key].name}
                  </button>
                ))}
              </div>
              {editingTemplate && (
                <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 mb-4 space-y-2">
                  <p className="text-[10px] text-[#3a3a3a] mb-2">
                    Editing: <span className="font-medium text-[#666]">{templates[editingTemplate].name}</span> — auto-saves
                  </p>
                  <input
                    value={templates[editingTemplate].subject}
                    onChange={(e) => updateTemplate(editingTemplate, 'subject', e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-[#ccc] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/30"
                    placeholder="Subject line"
                  />
                  <textarea
                    value={templates[editingTemplate].body}
                    onChange={(e) => updateTemplate(editingTemplate, 'body', e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg h-36 resize-none text-[#ccc] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/30"
                  />
                </div>
              )}
            </div>

            {/* Per-contact email cards */}
            {contacts.map((contact) => {
              const isSending = sendingIds.has(contact.id);
              const results  = sendResults[contact.id] ?? [];
              const hasSent  = contactSentSuccessfully(contact.id);
              const predicted = contact.predictedEmails ?? [];
              const selected  = selectedEmails[contact.id] ?? predicted;
              const manual    = manualEmail[contact.id] ?? '';
              const recipientCount = selected.length + (manual.trim() ? 1 : 0);

              return (
                <div key={contact.id} className="border border-white/[0.08] rounded-xl p-4">
                  {/* Contact header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#e0e0e0] text-sm">{contact.name}</p>
                      <p className="text-[11px] text-[#555]">{contact.title}</p>
                    </div>
                    {hasSent && (
                      <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5 ml-2 shrink-0">
                        Sent ✓
                      </span>
                    )}
                  </div>

                  {/* Recipients */}
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-1.5">Recipients</p>
                    {predicted.length > 0 ? (
                      <div className="space-y-1 mb-2">
                        {predicted.map((email) => (
                          <label key={email} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={selected.includes(email)}
                              onChange={() => toggleEmail(contact.id, email)}
                              className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
                            />
                            <span className="text-[11px] text-[#888] font-mono group-hover:text-[#aaa] transition-colors truncate">
                              {email}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#444] mb-2 italic">No predicted addresses found</p>
                    )}
                    <input
                      type="email"
                      value={manual}
                      onChange={(e) => setManualEmail((prev) => ({ ...prev, [contact.id]: e.target.value }))}
                      placeholder="Add email address manually…"
                      className="w-full text-[11px] p-2 bg-white/[0.02] border border-white/[0.06] rounded-lg text-[#aaa] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/20 font-mono"
                    />
                  </div>

                  {/* Apply template */}
                  <div className="flex gap-1 flex-wrap mb-3">
                    <span className="text-[10px] text-[#333] self-center mr-1">Apply:</span>
                    {(Object.keys(templates) as (keyof typeof DEFAULT_TEMPLATES)[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => applyTemplate(contact.id, key)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] text-[#666] hover:bg-white/[0.07] hover:text-[#999] cursor-pointer transition-colors"
                      >
                        {templates[key].name}
                      </button>
                    ))}
                  </div>

                  {/* Editable subject + body */}
                  <input
                    value={emailEdits[contact.id]?.subject ?? ''}
                    onChange={(e) => setEmailEdits((prev) => ({ ...prev, [contact.id]: { ...prev[contact.id], subject: e.target.value } }))}
                    className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg mb-2 text-[#ccc] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/30"
                    placeholder="Subject"
                  />
                  <textarea
                    value={emailEdits[contact.id]?.body ?? ''}
                    onChange={(e) => setEmailEdits((prev) => ({ ...prev, [contact.id]: { ...prev[contact.id], body: e.target.value } }))}
                    className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg h-40 resize-none mb-3 text-[#ccc] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/30"
                  />

                  {/* Send button */}
                  <button
                    onClick={() => handleSendEmail(contact.id)}
                    disabled={isSending || recipientCount === 0}
                    className="w-full py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
                  >
                    {isSending
                      ? 'Sending…'
                      : recipientCount > 0
                      ? `Send to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}${(optimisedCVText && cvAttached) || manualCVPdf ? ' + CV' : ''}`
                      : 'Select at least one recipient'}
                  </button>

                  {/* Per-address results */}
                  {results.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {results.map((r) => (
                        <div key={r.address} className="flex items-center gap-2">
                          <span className={`text-[10px] ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                            {r.success ? '✓' : '✗'}
                          </span>
                          <span className="text-[10px] font-mono text-[#666] truncate flex-1">{r.address}</span>
                          {!r.success && r.error && (
                            <span className="text-[10px] text-red-400/70 truncate max-w-[140px]">{r.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LINKEDIN TAB */}
        {tab === 'linkedin' && contacts.length > 0 && (
          <div className="space-y-5">
            {contacts.map((contact) => {
              const li = linkedinEdits[contact.id] ?? {
                connection: contact.linkedinConnectionRequest,
                followUp1: contact.linkedinFollowUp1,
                followUp2: contact.linkedinFollowUp2,
              };

              return (
                <div key={contact.id} className="border border-white/[0.08] rounded-xl p-4">
                  <div className="mb-3">
                    <p className="font-medium text-[#e0e0e0] text-sm">{contact.name}</p>
                    <p className="text-[11px] text-[#555]">{contact.title}</p>
                    {contact.linkedinUrl && (
                      <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-indigo-400 hover:underline mt-0.5 inline-block">
                        View LinkedIn →
                      </a>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">1</span>
                        <span className="text-xs font-medium text-[#aaa]">Connection Request</span>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 rounded-full px-2 py-0.5 ml-auto">Day 1</span>
                      </div>
                      <textarea value={li.connection}
                        onChange={(e) => setLinkedinEdits((prev) => ({ ...prev, [contact.id]: { ...li, connection: e.target.value } }))}
                        className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg h-20 resize-none mb-1 text-[#ccc] focus:outline-none focus:border-indigo-500/30"
                        maxLength={300}
                      />
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] ${li.connection.length > 280 ? 'text-red-400' : 'text-[#333]'}`}>
                          {li.connection.length}/300
                        </span>
                        <button onClick={() => handleCopyLinkedIn(contact.id + '-connection', li.connection)}
                          className="text-[10px] px-2.5 py-1 bg-white/[0.04] text-[#666] hover:bg-white/[0.08] hover:text-[#999] rounded-lg cursor-pointer transition-colors">
                          {copiedId === contact.id + '-connection' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">2</span>
                        <span className="text-xs font-medium text-[#aaa]">LinkedIn Follow-up</span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 ml-auto">Day 6</span>
                      </div>
                      <textarea value={li.followUp1}
                        onChange={(e) => setLinkedinEdits((prev) => ({ ...prev, [contact.id]: { ...li, followUp1: e.target.value } }))}
                        className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg h-20 resize-none mb-1 text-[#ccc] focus:outline-none focus:border-indigo-500/30"
                      />
                      <div className="flex justify-end">
                        <button onClick={() => handleCopyLinkedIn(contact.id + '-followup1', li.followUp1)}
                          className="text-[10px] px-2.5 py-1 bg-white/[0.04] text-[#666] hover:bg-white/[0.08] hover:text-[#999] rounded-lg cursor-pointer transition-colors">
                          {copiedId === contact.id + '-followup1' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">3</span>
                        <span className="text-xs font-medium text-[#aaa]">Email Follow-up</span>
                        <span className="text-[10px] bg-red-500/10 text-red-400 rounded-full px-2 py-0.5 ml-auto">Day 8</span>
                      </div>
                      <textarea value={li.followUp2}
                        onChange={(e) => setLinkedinEdits((prev) => ({ ...prev, [contact.id]: { ...li, followUp2: e.target.value } }))}
                        className="w-full text-xs p-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg h-20 resize-none mb-1 text-[#ccc] focus:outline-none focus:border-indigo-500/30"
                      />
                      <div className="flex justify-end">
                        <button onClick={() => handleCopyLinkedIn(contact.id + '-followup2', li.followUp2)}
                          className="text-[10px] px-2.5 py-1 bg-white/[0.04] text-[#666] hover:bg-white/[0.08] hover:text-[#999] rounded-lg cursor-pointer transition-colors">
                          {copiedId === contact.id + '-followup2' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
