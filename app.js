(() => {
  'use strict';
  const topics = ['All', 'Life', 'Courage', 'Creativity', 'Change', 'Love', 'Gratitude', 'Music', 'Other'];
  const configured = () => window.supabase && window.FLASH_SUPABASE_URL && window.FLASH_SUPABASE_ANON_KEY && !window.FLASH_SUPABASE_URL.includes('YOUR_PROJECT_ID') && !window.FLASH_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '');
  let client = null;
  let currentUser = null;
  let selectedTopic = 'All';
  let quotes = [];
  let profiles = [];
  let toastTimer;
  let authMode = 'signup';

  const feed = $('#quote-feed');
  const topicFilters = $('#topic-filters');

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function initials(name) {
    return esc(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '✦';
  }

  function profileFor(id) { return profiles.find(profile => profile.id === id) || { id, display_name: 'Flash author', bio: '' }; }

  function renderTopics() {
    topicFilters.replaceChildren();
    topics.forEach(topic => {
      const button = document.createElement('button');
      button.className = `topic-button${selectedTopic === topic ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = topic === 'All' ? 'All quotes' : topic;
      button.addEventListener('click', () => { selectedTopic = topic; renderTopics(); renderFeed(); });
      topicFilters.append(button);
    });
  }

  function makeButton(text, className, action) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = className; button.textContent = text;
    button.addEventListener('click', action);
    return button;
  }

  function renderFeed() {
    const term = $('#search-input').value.trim().toLowerCase();
    const visible = quotes.filter(quote => {
      const author = profileFor(quote.author_id);
      return (selectedTopic === 'All' || quote.topic === selectedTopic) &&
        (!term || `${quote.body} ${author.display_name} ${quote.topic}`.toLowerCase().includes(term));
    });
    feed.replaceChildren();
    $('#feed-empty').classList.toggle('hidden', visible.length > 0);
    visible.forEach(quote => feed.append(renderQuote(quote)));
  }

  function renderQuote(quote) {
    const author = profileFor(quote.author_id);
    const card = document.createElement('article'); card.className = 'quote-card';
    const symbol = document.createElement('div'); symbol.className = 'quote-symbol'; symbol.textContent = '“';
    const body = document.createElement('blockquote'); body.className = 'quote-body'; body.textContent = quote.body;
    const topic = document.createElement('span'); topic.className = 'quote-topic'; topic.textContent = quote.topic;
    const authorRow = document.createElement('div'); authorRow.className = 'quote-author';
    const avatar = document.createElement('span'); avatar.className = 'author-avatar'; avatar.textContent = initials(author.display_name);
    const authorText = document.createElement('div');
    const authorLink = document.createElement('button'); authorLink.className = 'text-button author-name'; authorLink.type = 'button'; authorLink.textContent = author.display_name;
    authorLink.addEventListener('click', () => showProfile(author.id));
    const handle = document.createElement('div'); handle.className = 'author-handle'; handle.textContent = new Date(quote.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    authorText.append(authorLink, handle); authorRow.append(avatar, authorText);
    const actions = document.createElement('div'); actions.className = 'quote-actions';
    const like = makeButton(`${quote.liked_by_me ? '♥' : '♡'} ${quote.like_count || 0}`, `small-action${quote.liked_by_me ? ' liked' : ''}`, () => toggleLike(quote));
    like.setAttribute('aria-label', quote.liked_by_me ? 'Unlike quote' : 'Like quote');
    const copy = makeButton('Copy', 'small-action', async () => {
      try { await navigator.clipboard.writeText(`“${quote.body}” — ${author.display_name}`); toast('Quote copied.'); }
      catch { toast('Copy is not available in this browser context.'); }
    });
    const share = makeButton('Share ↗', 'small-action share-action', () => shareQuote(quote, author));
    actions.append(like, copy, share);

    const details = document.createElement('details'); details.className = 'comments';
    const summary = document.createElement('summary'); summary.textContent = `Comments (${quote.comments?.length || 0})`;
    const list = document.createElement('ul'); list.className = 'comment-list';
    (quote.comments || []).forEach(comment => {
      const item = document.createElement('li'); item.className = 'comment-item';
      const name = document.createElement('b'); name.textContent = `${comment.author?.display_name || 'Member'}: `;
      item.append(name, document.createTextNode(comment.body)); list.append(item);
    });
    const form = document.createElement('form'); form.className = 'comment-form';
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 500; input.required = true; input.placeholder = currentUser ? 'Add a thoughtful comment…' : 'Log in to comment'; input.disabled = !currentUser; input.setAttribute('aria-label', 'Comment');
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Send'; submit.disabled = !currentUser;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const text = input.value.trim(); if (!text) return;
      const { error } = await client.from('comments').insert({ quote_id: quote.id, author_id: currentUser.id, body: text });
      if (error) return toast(error.message);
      await loadQuotes(); toast('Comment added.');
    });
    form.append(input, submit); details.append(summary, list, form);
    card.append(symbol, body, topic, authorRow, actions, details);
    return card;
  }

  async function toggleLike(quote) {
    if (!currentUser) return openAuth('login');
    if (quote.liked_by_me) {
      const { error } = await client.from('likes').delete().eq('quote_id', quote.id).eq('user_id', currentUser.id);
      if (error) return toast(error.message);
    } else {
      const { error } = await client.from('likes').insert({ quote_id: quote.id, user_id: currentUser.id });
      if (error && error.code !== '23505') return toast(error.message);
    }
    await loadQuotes();
  }

  async function shareQuote(quote, author) {
    const text = `“${quote.body}” — ${author.display_name}`;
    const url = `${location.origin}${location.pathname}#quote-${quote.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Flash Inspiration', text, url }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    const encoded = encodeURIComponent(`${text} ${url}`);
    const choice = prompt('Share with: X, Facebook, or WhatsApp', 'WhatsApp');
    const links = { x: `https://twitter.com/intent/tweet?text=${encoded}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, whatsapp: `https://wa.me/?text=${encoded}` };
    if (choice && links[choice.trim().toLowerCase()]) window.open(links[choice.trim().toLowerCase()], '_blank', 'noopener,noreferrer');
  }

  async function showProfile(id) {
    const profile = profileFor(id);
    const content = $('#profile-content'); content.replaceChildren();
    const head = document.createElement('div'); head.className = 'profile-head';
    const avatar = document.createElement('span'); avatar.className = 'author-avatar'; avatar.textContent = initials(profile.display_name);
    const info = document.createElement('div'); const title = document.createElement('h2'); title.textContent = profile.display_name;
    const bio = document.createElement('p'); bio.textContent = profile.bio || 'Sharing ideas with the Flash Inspiration community.'; info.append(title, bio); head.append(avatar, info);
    const list = document.createElement('div'); list.className = 'profile-quotes';
    quotes.filter(q => q.author_id === id).forEach(q => { const item = document.createElement('div'); item.className = 'profile-quote'; item.textContent = `“${q.body}”`; list.append(item); });
    if (!list.childElementCount) { const empty = document.createElement('p'); empty.className = 'notice'; empty.textContent = 'No published quotes yet.'; list.append(empty); }
    content.append(head, list); $('#profile-dialog').showModal();
  }

  async function loadQuotes() {
    if (!client) return;
    const { data: rows, error } = await client.from('quotes').select('id,author_id,body,topic,created_at,profiles!quotes_author_id_fkey(id,display_name,bio),likes(user_id),comments(id,body,created_at,author:profiles!comments_author_id_fkey(display_name))').eq('status', 'published').order('created_at', { ascending: false }).limit(100);
    if (error) { $('#connection-message').textContent = `Could not load quotes: ${error.message}`; return; }
    const ids = [...new Set((rows || []).map(row => row.author_id))];
    profiles = (rows || []).flatMap(row => row.profiles ? [row.profiles] : []).filter((profile, index, list) => list.findIndex(item => item.id === profile.id) === index);
    if (currentUser && !profiles.some(profile => profile.id === currentUser.id)) {
      const { data: me } = await client.from('profiles').select('id,display_name,bio').eq('id', currentUser.id).maybeSingle();
      if (me) profiles.push(me);
    }
    quotes = (rows || []).map(row => ({ ...row, like_count: row.likes?.length || 0, liked_by_me: Boolean(currentUser && row.likes?.some(like => like.user_id === currentUser.id)), comments: (row.comments || []).sort((a,b) => new Date(a.created_at)-new Date(b.created_at)) }));
    renderFeed(); renderAuthors();
    $('#connection-message').textContent = quotes.length ? '' : 'Be the first to share an original thought. Published quotes appear here after moderation.';
  }

  function renderAuthors() {
    const holder = $('#author-list'); holder.replaceChildren();
    const authorIds = [...new Set(quotes.map(quote => quote.author_id))];
    authorIds.slice(0, 8).forEach(id => {
      const profile = profileFor(id); const button = document.createElement('button'); button.className = 'author-card'; button.type = 'button';
      const avatar = document.createElement('span'); avatar.className = 'author-avatar'; avatar.textContent = initials(profile.display_name);
      const text = document.createElement('span'); const name = document.createElement('strong'); name.textContent = profile.display_name;
      const count = document.createElement('span'); count.textContent = `${quotes.filter(q => q.author_id === id).length} published quote${quotes.filter(q => q.author_id === id).length === 1 ? '' : 's'}`;
      text.append(name, count); button.append(avatar, text); button.addEventListener('click', () => showProfile(id)); holder.append(button);
    });
    $('#authors-empty').classList.toggle('hidden', authorIds.length > 0);
  }

  function setAuthMode(mode) {
    authMode = mode; const signup = mode === 'signup';
    $('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
    $('#auth-help').textContent = signup ? 'Join Flash Inspiration and share your original ideas.' : 'Log in to like, comment, and share your voice.';
    $('#name-field').classList.toggle('hidden', !signup);
    $('#auth-name').required = signup;
    $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auth-submit').textContent = signup ? 'Create account' : 'Log in';
    $('#switch-copy').textContent = signup ? 'Already have an account?' : 'New to Flash Inspiration?';
    $('#auth-switch').textContent = signup ? 'Log in' : 'Join free';
    $('#auth-error').textContent = '';
  }
  function openAuth(mode) { setAuthMode(mode); $('#auth-dialog').showModal(); }

  async function updateSession(session) {
    currentUser = session?.user || null;
    const label = $('#user-label'); label.textContent = currentUser ? currentUser.user_metadata?.display_name || currentUser.email : '';
    $('#login-open').classList.toggle('hidden', Boolean(currentUser));
    $('#signup-open').classList.toggle('hidden', Boolean(currentUser));
    $('#logout-button').classList.toggle('hidden', !currentUser);
    $('#join-cta').textContent = currentUser ? 'Share an original quote ↓' : 'Create your author account →';
    $('#join-cta').onclick = () => currentUser ? $('#share-quote').scrollIntoView({ behavior: 'smooth' }) : openAuth('signup');
    if (client) await loadQuotes();
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear(); renderTopics();
    $('#search-input').addEventListener('input', renderFeed);
    $('#login-open').addEventListener('click', () => openAuth('login'));
    $('#signup-open').addEventListener('click', () => openAuth('signup'));
    $('#join-cta').addEventListener('click', () => openAuth('signup'));
    $('#auth-switch').addEventListener('click', () => setAuthMode(authMode === 'signup' ? 'login' : 'signup'));
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
    $('#logout-button').addEventListener('click', async () => { const { error } = await client.auth.signOut(); if (error) toast(error.message); else toast('You are logged out.'); });
    $('#auth-form').addEventListener('submit', async event => {
      event.preventDefault(); $('#auth-error').textContent = '';
      const email = $('#auth-email').value.trim(); const password = $('#auth-password').value;
      let result;
      if (authMode === 'signup') {
        const displayName = $('#auth-name').value.trim();
        result = await client.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (!result.error && !result.data.session) { $('#auth-dialog').close(); toast('Check your email to confirm your account, then log in.'); return; }
      } else result = await client.auth.signInWithPassword({ email, password });
      if (result.error) { $('#auth-error').textContent = result.error.message; return; }
      $('#auth-dialog').close(); toast(authMode === 'signup' ? 'Welcome! Your author profile is ready.' : 'Welcome back!');
    });

    if (!configured()) {
      $('#connection-message').textContent = 'Preview mode: connect a Supabase project to enable real accounts, shared quotes, likes, and comments. Setup steps are in README.md.';
      return;
    }
    client = window.supabase.createClient(window.FLASH_SUPABASE_URL, window.FLASH_SUPABASE_ANON_KEY);
    const { data: { session } } = await client.auth.getSession();
    await updateSession(session);
    client.auth.onAuthStateChange((_event, nextSession) => { setTimeout(() => updateSession(nextSession), 0); });
    const { data: channel } = await client.channel('public-quote-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => loadQuotes()).subscribe();
    void channel;
    $('#connection-message').textContent = 'Quotes are shared with the community. New submissions are reviewed before appearing publicly.';
  }

  init().catch(error => { console.error(error); $('#connection-message').textContent = 'The app could not connect. Check the Supabase setup and browser console.'; });
})();
