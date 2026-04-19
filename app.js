/* =========================================================
   UTILITIES
   ========================================================= */
const MONTHS_FR = ['jan.','fév.','mar.','avr.','mai','juin','juil.','aoû.','sep.','oct.','nov.','déc.'];

function fmtDate(iso) {
  if (!iso) return 'aujourd\'hui';
  const [y, m] = iso.split('-');
  return m ? `${MONTHS_FR[+m - 1]} ${y}` : y;
}

function fmtDateRange(start, end) {
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* =========================================================
   THEME
   ========================================================= */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

/* =========================================================
   DATA
   ========================================================= */
let DATA = null;
let dirty = false;

async function loadData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
    return DATA;
  } catch (e) {
    console.error('Erreur chargement data.json:', e);
    DATA = { profile: {}, skills: [], experiences: [], educations: [], publications: [], implications: [], meta: {} };
    return DATA;
  }
}

function markDirty() {
  dirty = true;
  const el = document.getElementById('admin-status');
  if (el) { el.textContent = '● non sauvegardé'; el.className = 'admin-status dirty'; }
}

function markSaved() {
  dirty = false;
  const el = document.getElementById('admin-status');
  if (el) { el.textContent = '✓ sauvegardé'; el.className = 'admin-status saved'; }
}

function getGithubConfig() {
  return {
    token:  localStorage.getItem('gh_token')  || '',
    repo:   localStorage.getItem('gh_repo')   || '',
    path:   localStorage.getItem('gh_path')   || 'data.json',
    branch: localStorage.getItem('gh_branch') || 'main',
  };
}

function saveGithubConfig(cfg) {
  localStorage.setItem('gh_token',  cfg.token);
  localStorage.setItem('gh_repo',   cfg.repo);
  localStorage.setItem('gh_path',   cfg.path);
  localStorage.setItem('gh_branch', cfg.branch);
}

async function syncToGithub() {
  const cfg = getGithubConfig();
  if (!cfg.token || !cfg.repo) { toast('Configurez d\'abord le token et le dépôt GitHub.', 'error'); return; }

  const el = document.getElementById('admin-status');
  if (el) { el.textContent = '⟳ sauvegarde…'; el.className = 'admin-status saving'; }

  try {
    const apiBase = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`;
    const headers = { Authorization: `token ${cfg.token}`, 'Content-Type': 'application/json' };

    // Get current SHA
    let sha = '';
    const getRes = await fetch(`${apiBase}?ref=${cfg.branch}`, { headers });
    if (getRes.ok) { const j = await getRes.json(); sha = j.sha; }

    DATA.meta.lastUpdated = new Date().toISOString().slice(0, 10);
    DATA.meta.version = (DATA.meta.version || 0) + 1;

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(DATA, null, 2))));
    const body = { message: `Portfolio update — ${DATA.meta.lastUpdated}`, content, branch: cfg.branch };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putRes.ok) throw new Error(await putRes.text());

    markSaved();
    toast('Sauvegardé sur GitHub ✓', 'success');
  } catch (e) {
    if (el) { el.textContent = '✗ erreur'; el.className = 'admin-status error'; }
    toast('Erreur GitHub : ' + e.message, 'error');
  }
}

/* =========================================================
   NAVIGATION
   ========================================================= */
const NAV_LINKS = [
  { href: 'index.html',        label: 'Accueil',      page: 'home' },
  { href: 'cursus.html',       label: 'Cursus',       page: 'cursus' },
  { href: 'experiences.html',  label: 'Expériences',  page: 'experiences' },
  { href: 'publications.html', label: 'Publications',  page: 'publications' },
  { href: 'implications.html', label: 'Implications',  page: 'implications' },
  { href: 'contact.html',      label: 'Contact',      page: 'contact' },
];

function renderHeader(data) {
  const page = document.body.dataset.page;
  const name = escapeHtml(data.profile?.name || 'Portfolio');
  const theme = document.documentElement.getAttribute('data-theme');

  const links = NAV_LINKS.map(l =>
    `<a href="${l.href}" class="nav-link${l.page === page ? ' active' : ''}">${l.label}</a>`
  ).join('');

  document.getElementById('site-header').innerHTML = `
    <div class="container">
      <div class="header-inner">
        <span class="brand" id="brand-mark" title="Triple-clic pour l'admin">${name}</span>
        <nav class="nav" id="main-nav">${links}</nav>
        <div class="header-actions">
          <button class="btn-icon" id="theme-toggle" title="Changer le thème" aria-label="Changer le thème">
            ${theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button class="btn-icon nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Mobile nav
  document.getElementById('nav-toggle').addEventListener('click', () => {
    document.getElementById('main-nav').classList.toggle('open');
  });

  // Triple-click → admin
  let clicks = 0, clickTimer;
  document.getElementById('brand-mark').addEventListener('click', () => {
    clicks++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (clicks >= 3) showAdminLock();
      clicks = 0;
    }, 500);
  });
}

function renderFooter(data) {
  const name = escapeHtml(data.profile?.name || '');
  document.getElementById('site-footer').innerHTML = `
    <div class="container">
      <div class="footer-inner">
        <span>${name} · ${new Date().getFullYear()}</span>
        <span class="footer-hint" title="Triple-clic sur le nom pour l'administration">admin</span>
      </div>
    </div>
  `;
}

/* =========================================================
   PAGE: HOME
   ========================================================= */
function renderHome(data) {
  const p = data.profile || {};
  const skills = data.skills || [];
  const skillMap = Object.fromEntries(skills.map(s => [s.id, s]));

  const hardSkills  = skills.filter(s => s.category === 'hard');
  const softSkills  = skills.filter(s => s.category === 'soft');
  const langSkills  = skills.filter(s => s.category === 'language');

  function skillTagsHtml(list) {
    return list.map(s => `
      <span class="skill-tag" data-category="${escapeHtml(s.category)}" data-skill-id="${escapeHtml(s.id)}"
            title="${escapeHtml(s.level)}">
        ${escapeHtml(s.name)}
        <span class="level">${escapeHtml(s.level)}</span>
      </span>`).join('');
  }

  document.getElementById('main-content').innerHTML = `
    <!-- HERO -->
    <section class="hero">
      <div class="container">
        <div class="hero-inner">
          <div class="hero-main">
            <div class="hero-status">
              <span class="pulse"></span>
              <span class="mono">${escapeHtml(p.title || '')}</span>
            </div>
            <h1>${escapeHtml(p.tagline || '')}</h1>
            <div class="hero-meta">
              ${p.lab ? `<div class="hero-meta-item"><span class="icon">🏛</span>${escapeHtml(p.lab)}</div>` : ''}
              ${p.location ? `<div class="hero-meta-item"><span class="icon">📍</span>${escapeHtml(p.location)}</div>` : ''}
              ${p.email ? `<div class="hero-meta-item"><span class="icon">✉️</span><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></div>` : ''}
            </div>
            <div class="hero-cta">
              ${p.links?.scholar ? `<a href="${escapeHtml(p.links.scholar)}" class="btn btn-primary" target="_blank" rel="noopener">Publications →</a>` : ''}
              <a href="contact.html" class="btn btn-secondary">Me contacter</a>
            </div>
          </div>
          <aside class="hero-aside">
            <div class="hero-aside-title">Fiche rapide</div>
            ${p.name ? `<div class="hero-fact"><span class="hero-fact-label">Nom</span><span class="hero-fact-value">${escapeHtml(p.name)}</span></div>` : ''}
            ${p.location ? `<div class="hero-fact"><span class="hero-fact-label">Lieu</span><span class="hero-fact-value">${escapeHtml(p.location)}</span></div>` : ''}
            ${p.email ? `<div class="hero-fact"><span class="hero-fact-label">Email</span><span class="hero-fact-value mono"><a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a></span></div>` : ''}
            ${p.orcid ? `<div class="hero-fact"><span class="hero-fact-label">ORCID</span><span class="hero-fact-value mono">${escapeHtml(p.orcid)}</span></div>` : ''}
          </aside>
        </div>
      </div>
    </section>

    <!-- ABOUT -->
    <section class="section reveal" id="about">
      <div class="container">
        <div class="section-title">
          <div class="section-label">À propos</div>
          <h2>Qui suis-je&nbsp;?</h2>
        </div>
        <div class="about-grid">
          <div class="about-text">
            ${(p.about || '').split('\n').filter(Boolean).map(l => `<p>${escapeHtml(l)}</p>`).join('') || `<p>${escapeHtml(p.about || '')}</p>`}
          </div>
          <div class="about-facts">
            ${p.name ? `<div class="about-fact"><span class="about-fact-label">Nom</span><span class="about-fact-value">${escapeHtml(p.name)}</span></div>` : ''}
            ${p.location ? `<div class="about-fact"><span class="about-fact-label">Localisation</span><span class="about-fact-value">${escapeHtml(p.location)}</span></div>` : ''}
            ${p.lab ? `<div class="about-fact"><span class="about-fact-label">Laboratoire</span><span class="about-fact-value">${escapeHtml(p.lab)}</span></div>` : ''}
            ${p.email ? `<div class="about-fact"><span class="about-fact-label">Email</span><span class="about-fact-value mono">${escapeHtml(p.email)}</span></div>` : ''}
            ${p.orcid ? `<div class="about-fact"><span class="about-fact-label">ORCID</span><span class="about-fact-value mono">${escapeHtml(p.orcid)}</span></div>` : ''}
          </div>
        </div>
      </div>
    </section>

    <!-- SKILLS -->
    <section class="section reveal" id="skills">
      <div class="container">
        <div class="section-title">
          <div class="section-label">Compétences</div>
          <h2>Ce que je fais</h2>
          <p>Cliquez sur une compétence pour voir les connexions.</p>
        </div>
        <div class="skills-layout">
          <div class="graph-container" id="skill-graph">
            <div class="graph-hint">Scroll pour zoomer · Glisser pour naviguer</div>
          </div>
          <div class="skill-categories">
            <div class="skill-card">
              <div class="skill-card-title">Techniques</div>
              <div class="skill-tags" id="hard-tags">${skillTagsHtml(hardSkills)}</div>
            </div>
            <div class="skill-card">
              <div class="skill-card-title">Transversales</div>
              <div class="skill-tags" id="soft-tags">${skillTagsHtml(softSkills)}</div>
            </div>
            <div class="skill-card">
              <div class="skill-card-title">Langues</div>
              <div class="skill-tags" id="lang-tags">${skillTagsHtml(langSkills)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- QUICK LINKS -->
    <section class="section reveal">
      <div class="container">
        <div class="section-title">
          <div class="section-label">Explorer</div>
          <h2>Aller plus loin</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">
          ${[
            { href: 'cursus.html', icon: '🎓', label: 'Cursus', desc: 'Formations et diplômes' },
            { href: 'experiences.html', icon: '💼', label: 'Expériences', desc: 'Parcours professionnel' },
            { href: 'publications.html', icon: '📄', label: 'Publications', desc: 'Articles et travaux' },
            { href: 'implications.html', icon: '🤝', label: 'Implications', desc: 'Science et société' },
            { href: 'contact.html', icon: '✉️', label: 'Contact', desc: 'Me rejoindre' },
          ].map(l => `
            <a href="${l.href}" class="social-link">
              <div class="social-link-icon">${l.icon}</div>
              <div class="social-link-info">
                <span class="social-link-name">${l.label}</span>
                <span class="social-link-handle">${l.desc}</span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    </section>
  `;

  // Skill tag interactions
  document.querySelectorAll('.skill-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const sid = tag.dataset.skillId;
      const isSelected = tag.classList.contains('selected');
      document.querySelectorAll('.skill-tag').forEach(t => t.classList.remove('selected'));
      if (!isSelected) {
        tag.classList.add('selected');
        highlightSkillInGraph(sid);
      } else {
        resetGraphHighlight();
      }
    });
  });

  // D3 graph
  if (typeof d3 !== 'undefined' && skills.length > 0) {
    initSkillGraph(data);
  }

  initReveal();
}

/* =========================================================
   D3 SKILL GRAPH
   ========================================================= */
let graphSim = null;
let svgSel = null;

function initSkillGraph(data) {
  const container = document.getElementById('skill-graph');
  if (!container) return;

  const skills = data.skills || [];
  const items = [...(data.experiences || []), ...(data.educations || []), ...(data.publications || [])];

  // Build nodes & links
  const nodes = [
    ...skills.map(s => ({ id: s.id, label: s.name, type: 'skill', category: s.category })),
    ...items.map(i => ({
      id: i.id,
      label: i.role || i.degree || i.title || i.id,
      type: i.type || 'publication',
      category: null
    })),
  ];

  const links = [];
  items.forEach(item => {
    (item.skills || []).forEach(sid => {
      if (skills.find(s => s.id === sid)) {
        links.push({ source: item.id, target: sid });
      }
    });
  });

  const W = container.clientWidth || 400;
  const H = container.clientHeight || 400;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', '100%');
  svgSel = svg;

  const g = svg.append('g');

  // Zoom
  svg.call(d3.zoom().scaleExtent([.3, 3]).on('zoom', e => g.attr('transform', e.transform)));

  // Color scheme
  const colors = {
    hard: 'var(--accent)', soft: 'var(--accent-2)', language: 'var(--text-muted)',
    experience: '#22c55e', education: '#f59e0b', publication: '#8b5cf6',
  };

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', 'var(--border)').attr('stroke-width', 1.2).attr('opacity', .6);

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append('circle')
    .attr('r', d => d.type === 'skill' ? 10 : 16)
    .attr('fill', d => colors[d.category || d.type] || 'var(--text-muted)')
    .attr('opacity', .85)
    .attr('stroke', 'var(--bg)').attr('stroke-width', 2);

  node.append('text')
    .attr('dy', d => d.type === 'skill' ? -14 : -20)
    .attr('text-anchor', 'middle')
    .attr('font-size', d => d.type === 'skill' ? 10 : 9)
    .attr('fill', 'var(--text)')
    .attr('font-family', 'var(--font-sans)')
    .text(d => d.label.length > 18 ? d.label.slice(0, 17) + '…' : d.label);

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(22));
  graphSim = sim;

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

function highlightSkillInGraph(skillId) {
  if (!svgSel) return;
  svgSel.selectAll('g > g circle')
    .attr('opacity', d => d.id === skillId || (d.skills || []).includes(skillId) ? 1 : .15);
  svgSel.selectAll('line')
    .attr('opacity', d => (d.source.id === skillId || d.target.id === skillId) ? 1 : .05);
}

function resetGraphHighlight() {
  if (!svgSel) return;
  svgSel.selectAll('circle').attr('opacity', .85);
  svgSel.selectAll('line').attr('opacity', .6);
}

/* =========================================================
   PAGE: CURSUS
   ========================================================= */
function renderCursus(data) {
  const educations = (data.educations || []).sort((a, b) => (b.start || '') > (a.start || '') ? 1 : -1);
  const skills = data.skills || [];
  const skillMap = Object.fromEntries(skills.map(s => [s.id, s]));

  function eduCard(ed) {
    const isOngoing = !ed.end;
    const skillTags = (ed.skills || []).map(sid => skillMap[sid]).filter(Boolean)
      .map(s => `<span class="timeline-skill-tag">${escapeHtml(s.name)}</span>`).join('');
    return `
      <div class="timeline-item reveal" data-id="${escapeHtml(ed.id)}">
        <div class="timeline-dot${isOngoing ? ' ongoing' : ''}"></div>
        <div class="timeline-card">
          <div class="timeline-meta">
            <span class="timeline-date">${fmtDateRange(ed.start, ed.end)}</span>
            ${isOngoing ? '<span class="timeline-badge">En cours</span>' : ''}
          </div>
          <h3>${escapeHtml(ed.degree || '')}</h3>
          <div class="timeline-org">${escapeHtml(ed.org || '')}</div>
          ${ed.description ? `<p class="timeline-desc">${escapeHtml(ed.description)}</p>` : ''}
          ${skillTags ? `<div class="timeline-skills">${skillTags}</div>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="container">
      <div class="page-hero">
        <div class="section-label">Cursus</div>
        <h1>Formations</h1>
        <p>Parcours universitaire et formations académiques.</p>
      </div>
      <div class="timeline">
        ${educations.length ? educations.map(eduCard).join('') : '<div class="empty-state">Aucune formation renseignée.</div>'}
      </div>
      <div style="height:80px;"></div>
    </div>
  `;

  initReveal();
}

/* =========================================================
   PAGE: EXPERIENCES
   ========================================================= */
function renderExperiences(data) {
  const experiences = (data.experiences || []).sort((a, b) => (b.start || '') > (a.start || '') ? 1 : -1);
  const skills = data.skills || [];
  const skillMap = Object.fromEntries(skills.map(s => [s.id, s]));

  function expCard(exp) {
    const isOngoing = !exp.end;
    const skillTags = (exp.skills || []).map(sid => skillMap[sid]).filter(Boolean)
      .map(s => `<span class="timeline-skill-tag">${escapeHtml(s.name)}</span>`).join('');
    return `
      <div class="timeline-item reveal" data-id="${escapeHtml(exp.id)}">
        <div class="timeline-dot${isOngoing ? ' ongoing' : ''}"></div>
        <div class="timeline-card">
          <div class="timeline-meta">
            <span class="timeline-date">${fmtDateRange(exp.start, exp.end)}</span>
            ${isOngoing ? '<span class="timeline-badge">En cours</span>' : ''}
            ${exp.location ? `<span class="mono text-muted" style="font-size:.75rem;">📍 ${escapeHtml(exp.location)}</span>` : ''}
          </div>
          <h3>${escapeHtml(exp.role || '')}</h3>
          <div class="timeline-org">${escapeHtml(exp.org || '')}</div>
          ${exp.description ? `<p class="timeline-desc">${escapeHtml(exp.description)}</p>` : ''}
          ${skillTags ? `<div class="timeline-skills">${skillTags}</div>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="container">
      <div class="page-hero">
        <div class="section-label">Expériences</div>
        <h1>Parcours professionnel</h1>
        <p>Postes, stages et activités d'enseignement.</p>
      </div>
      <div class="timeline">
        ${experiences.length ? experiences.map(expCard).join('') : '<div class="empty-state">Aucune expérience renseignée.</div>'}
      </div>
      <div style="height:80px;"></div>
    </div>
  `;

  initReveal();
}

/* =========================================================
   PAGE: PUBLICATIONS
   ========================================================= */
function renderPublications(data) {
  const publications = (data.publications || []).sort((a, b) => (b.year || 0) - (a.year || 0));
  const skills = data.skills || [];
  const skillMap = Object.fromEntries(skills.map(s => [s.id, s]));

  const years = [...new Set(publications.map(p => p.year))].sort((a, b) => b - a);

  function pubCard(pub) {
    const isPreprint = !pub.url && (pub.venue?.toLowerCase().includes('préparation') || pub.venue?.toLowerCase().includes('preparation'));
    const skillTags = (pub.skills || []).map(sid => skillMap[sid]).filter(Boolean)
      .map(s => `<span class="timeline-skill-tag">${escapeHtml(s.name)}</span>`).join('');
    return `
      <div class="pub-card reveal" data-id="${escapeHtml(pub.id)}" data-year="${pub.year}">
        <div class="pub-year">${pub.year || '—'}</div>
        <div class="pub-body">
          <span class="pub-venue-badge${isPreprint ? ' preprint' : ''}">${escapeHtml(pub.venue || '')}</span>
          <div class="pub-title">${escapeHtml(pub.title || '')}</div>
          <div class="pub-authors">${escapeHtml(pub.authors || '')}</div>
          <div class="pub-actions">
            ${pub.url ? `<a href="${escapeHtml(pub.url)}" class="pub-link" target="_blank" rel="noopener">🔗 Lien</a>` : ''}
            ${pub.doi ? `<a href="https://doi.org/${escapeHtml(pub.doi)}" class="pub-link" target="_blank" rel="noopener">DOI</a>` : ''}
            ${skillTags ? `<div class="pub-skills">${skillTags}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="container">
      <div class="page-hero">
        <div class="section-label">Publications</div>
        <h1>Travaux &amp; publications</h1>
        <p>Articles scientifiques, prépublications et autres travaux.</p>
      </div>
      <div class="pub-filters" id="pub-filters">
        <button class="pub-filter active" data-year="all">Tous (${publications.length})</button>
        ${years.map(y => `<button class="pub-filter" data-year="${y}">${y}</button>`).join('')}
      </div>
      <div class="pub-list" id="pub-list">
        ${publications.length ? publications.map(pubCard).join('') : '<div class="empty-state">Aucune publication renseignée.</div>'}
      </div>
      <div style="height:80px;"></div>
    </div>
  `;

  // Year filter
  document.getElementById('pub-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.pub-filter');
    if (!btn) return;
    document.querySelectorAll('.pub-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const year = btn.dataset.year;
    document.querySelectorAll('.pub-card').forEach(card => {
      card.style.display = (year === 'all' || card.dataset.year === year) ? '' : 'none';
    });
  });

  initReveal();
}

/* =========================================================
   PAGE: IMPLICATIONS
   ========================================================= */
function renderImplications(data) {
  const implications = data.implications || [];

  const scientific = implications.filter(i => i.category === 'scientific');
  const publicAct  = implications.filter(i => i.category === 'public');
  const fundings   = implications.filter(i => i.category === 'funding');

  function implCard(item) {
    return `
      <div class="impl-card reveal">
        <div class="impl-icon ${escapeHtml(item.category)}">
          ${{ scientific: '🔬', public: '📢', funding: '💰' }[item.category] || '📌'}
        </div>
        <div class="impl-body">
          <div class="impl-title">${escapeHtml(item.title || '')}</div>
          <div class="impl-org">${escapeHtml(item.org || '')}</div>
          ${item.role ? `<span class="impl-role">${escapeHtml(item.role)}</span>` : ''}
          ${item.description ? `<div class="impl-desc">${escapeHtml(item.description)}</div>` : ''}
        </div>
        <div class="impl-date">${fmtDateRange(item.start, item.end)}</div>
      </div>`;
  }

  function fundingCard(item) {
    return `
      <div class="funding-card reveal">
        ${item.amount ? `<div class="funding-amount">${escapeHtml(item.amount)}</div>` : ''}
        <div class="funding-title">${escapeHtml(item.title || '')}</div>
        <div class="funding-org">${escapeHtml(item.org || '')}</div>
        <div class="funding-period">${fmtDateRange(item.start, item.end)}</div>
        ${item.description ? `<div class="funding-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>`;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="container">
      <div class="page-hero">
        <div class="section-label">Implications</div>
        <h1>Engagement &amp; rayonnement</h1>
        <p>Implications collectives, actions de vulgarisation et financements obtenus.</p>
      </div>

      ${scientific.length ? `
      <div class="impl-group">
        <div class="impl-section-title"><span class="icon">🔬</span>Implications scientifiques collectives</div>
        <div class="impl-grid">${scientific.map(implCard).join('')}</div>
      </div>` : ''}

      ${publicAct.length ? `
      <div class="impl-group">
        <div class="impl-section-title"><span class="icon">📢</span>Actions grand public</div>
        <div class="impl-grid">${publicAct.map(implCard).join('')}</div>
      </div>` : ''}

      ${fundings.length ? `
      <div class="impl-group">
        <div class="impl-section-title"><span class="icon">💰</span>Financements obtenus</div>
        <div class="funding-grid">${fundings.map(fundingCard).join('')}</div>
      </div>` : ''}

      ${!implications.length ? '<div class="empty-state">Aucune implication renseignée.</div>' : ''}

      <div style="height:80px;"></div>
    </div>
  `;

  initReveal();
}

/* =========================================================
   PAGE: CONTACT
   ========================================================= */
function renderContact(data) {
  const p = data.profile || {};
  const links = p.links || {};

  const socials = [
    { key: 'github',   icon: '🐙', name: 'GitHub',        handle: links.github?.replace('https://github.com/', '@') || '' },
    { key: 'linkedin', icon: '💼', name: 'LinkedIn',       handle: links.linkedin?.replace('https://linkedin.com/in/', '') || '' },
    { key: 'scholar',  icon: '📚', name: 'Google Scholar', handle: 'Voir les publications' },
    { key: 'orcid',    icon: '🆔', name: 'ORCID',          handle: p.orcid || '' },
  ].filter(s => links[s.key]);

  document.getElementById('main-content').innerHTML = `
    <div class="container">
      <div class="page-hero">
        <div class="section-label">Contact</div>
        <h1>Me contacter</h1>
        <p>N'hésitez pas à me contacter pour toute question, collaboration ou opportunité.</p>
      </div>
      <div class="contact-grid">
        <div class="contact-main">
          <p class="contact-intro">
            Je suis ouvert·e aux échanges scientifiques, aux collaborations de recherche et aux questions de vulgarisation.
            La meilleure façon de me joindre reste l'email.
          </p>
          ${p.email ? `<a href="mailto:${escapeHtml(p.email)}" class="contact-email-btn">✉️ ${escapeHtml(p.email)}</a>` : ''}
          ${socials.length ? `
          <div class="social-links">
            ${socials.map(s => `
              <a href="${escapeHtml(links[s.key])}" class="social-link" target="_blank" rel="noopener">
                <div class="social-link-icon">${s.icon}</div>
                <div class="social-link-info">
                  <span class="social-link-name">${s.name}</span>
                  <span class="social-link-handle">${escapeHtml(s.handle)}</span>
                </div>
              </a>`).join('')}
          </div>` : ''}
        </div>
        <div class="contact-aside">
          <h3>Informations</h3>
          ${p.name ? `<div class="contact-detail"><span class="contact-detail-icon">👤</span><div class="contact-detail-content"><span class="contact-detail-label">Nom</span><span class="contact-detail-value">${escapeHtml(p.name)}</span></div></div>` : ''}
          ${p.title ? `<div class="contact-detail"><span class="contact-detail-icon">🎓</span><div class="contact-detail-content"><span class="contact-detail-label">Statut</span><span class="contact-detail-value">${escapeHtml(p.title)}</span></div></div>` : ''}
          ${p.lab ? `<div class="contact-detail"><span class="contact-detail-icon">🏛</span><div class="contact-detail-content"><span class="contact-detail-label">Laboratoire</span><span class="contact-detail-value">${escapeHtml(p.lab)}</span></div></div>` : ''}
          ${p.location ? `<div class="contact-detail"><span class="contact-detail-icon">📍</span><div class="contact-detail-content"><span class="contact-detail-label">Localisation</span><span class="contact-detail-value">${escapeHtml(p.location)}</span></div></div>` : ''}
          ${p.orcid ? `<div class="contact-detail"><span class="contact-detail-icon">🆔</span><div class="contact-detail-content"><span class="contact-detail-label">ORCID</span><span class="contact-detail-value mono">${escapeHtml(p.orcid)}</span></div></div>` : ''}
        </div>
      </div>
      <div style="height:80px;"></div>
    </div>
  `;

  initReveal();
}

/* =========================================================
   SCROLL REVEAL
   ========================================================= */
function initReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: .08 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* =========================================================
   ADMIN PANEL
   ========================================================= */
let adminUnlocked = false;
let adminCurrentTab = 'profile';
let adminEditId = null;
let adminEditType = null;

function showAdminLock() {
  if (adminUnlocked) { showAdminPanel(); return; }
  const el = document.createElement('div');
  el.className = 'admin-lock';
  el.id = 'admin-lock';
  el.innerHTML = `
    <div class="admin-lock-box">
      <h2>🔐 Administration</h2>
      <p>Entrez le mot de passe pour accéder à l'interface d'édition.</p>
      <input type="password" class="input" id="admin-pw" placeholder="Mot de passe" autocomplete="current-password">
      <div class="lock-actions">
        <button class="btn btn-primary" id="admin-pw-submit">Connexion</button>
        <button class="btn btn-secondary" id="admin-pw-cancel">Annuler</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  const pw = el.querySelector('#admin-pw');
  pw.focus();

  el.querySelector('#admin-pw-cancel').addEventListener('click', () => el.remove());
  el.querySelector('#admin-pw-submit').addEventListener('click', () => submitAdminPassword(pw.value, el));
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminPassword(pw.value, el); });
}

async function submitAdminPassword(password, lockEl) {
  const stored = DATA?.meta?.passwordHash;
  let valid = false;

  if (!stored) {
    valid = password === 'admin';
  } else {
    const hash = await sha256(password);
    valid = hash === stored;
  }

  if (valid) {
    adminUnlocked = true;
    lockEl.remove();
    showAdminPanel();
  } else {
    toast('Mot de passe incorrect.', 'error');
    const pw = lockEl.querySelector('#admin-pw');
    pw.value = '';
    pw.focus();
  }
}

function showAdminPanel() {
  if (document.getElementById('admin-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'admin-panel-overlay';
  overlay.id = 'admin-overlay';
  overlay.addEventListener('click', closeAdminPanel);

  const drawer = document.createElement('div');
  drawer.className = 'admin-panel-drawer';
  drawer.id = 'admin-drawer';
  drawer.addEventListener('click', e => e.stopPropagation());

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  renderAdminDrawer();
}

function closeAdminPanel() {
  document.getElementById('admin-overlay')?.remove();
  document.getElementById('admin-drawer')?.remove();
}

function renderAdminDrawer() {
  const drawer = document.getElementById('admin-drawer');
  if (!drawer) return;

  const tabs = [
    { id: 'profile',      label: 'Profil' },
    { id: 'skills',       label: 'Compétences' },
    { id: 'experiences',  label: 'Expériences' },
    { id: 'educations',   label: 'Formations' },
    { id: 'publications', label: 'Publications' },
    { id: 'implications', label: 'Implications' },
    { id: 'sync',         label: 'Sync' },
  ];

  drawer.innerHTML = `
    <div class="admin-panel-header">
      <h2>✏️ Édition</h2>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="admin-status${dirty ? ' dirty' : ''}" id="admin-status">${dirty ? '● non sauvegardé' : '—'}</span>
        <button class="btn-icon" id="admin-close" title="Fermer">✕</button>
      </div>
    </div>
    <div class="admin-tabs">
      ${tabs.map(t => `<button class="admin-tab${t.id === adminCurrentTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="admin-tab-content" id="admin-tab-content"></div>
  `;

  drawer.querySelector('#admin-close').addEventListener('click', closeAdminPanel);
  drawer.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      adminCurrentTab = btn.dataset.tab;
      adminEditId = null;
      drawer.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAdminTabContent();
    });
  });

  renderAdminTabContent();
}

function renderAdminTabContent() {
  const el = document.getElementById('admin-tab-content');
  if (!el) return;
  switch (adminCurrentTab) {
    case 'profile':      renderProfileTab(el); break;
    case 'skills':       renderListTab(el, 'skills'); break;
    case 'experiences':  renderListTab(el, 'experiences'); break;
    case 'educations':   renderListTab(el, 'educations'); break;
    case 'publications': renderListTab(el, 'publications'); break;
    case 'implications': renderListTab(el, 'implications'); break;
    case 'sync':         renderSyncTab(el); break;
  }
}

/* --- PROFILE TAB --- */
function renderProfileTab(el) {
  const p = DATA.profile || {};
  const links = p.links || {};
  el.innerHTML = `
    <div class="admin-form">
      <div class="field-group"><label>Nom</label><input class="input" id="pf-name" value="${escapeHtml(p.name||'')}" placeholder="Prénom Nom"></div>
      <div class="field-group"><label>Titre / poste</label><input class="input" id="pf-title" value="${escapeHtml(p.title||'')}" placeholder="Doctorant·e en Neurosciences"></div>
      <div class="field-group"><label>Accroche (tagline)</label><input class="input" id="pf-tagline" value="${escapeHtml(p.tagline||'')}" placeholder="J'étudie..."></div>
      <div class="field-group"><label>Biographie</label><textarea class="textarea" id="pf-about" rows="5">${escapeHtml(p.about||'')}</textarea></div>
      <div class="form-row">
        <div class="field-group"><label>Localisation</label><input class="input" id="pf-location" value="${escapeHtml(p.location||'')}"></div>
        <div class="field-group"><label>Email</label><input class="input" id="pf-email" type="email" value="${escapeHtml(p.email||'')}"></div>
      </div>
      <div class="field-group"><label>Laboratoire</label><input class="input" id="pf-lab" value="${escapeHtml(p.lab||'')}"></div>
      <div class="field-group"><label>ORCID</label><input class="input" id="pf-orcid" value="${escapeHtml(p.orcid||'')}"></div>
      <hr class="admin-divider">
      <div class="field-group"><label>GitHub URL</label><input class="input" id="pf-github" value="${escapeHtml(links.github||'')}"></div>
      <div class="field-group"><label>LinkedIn URL</label><input class="input" id="pf-linkedin" value="${escapeHtml(links.linkedin||'')}"></div>
      <div class="field-group"><label>Google Scholar URL</label><input class="input" id="pf-scholar" value="${escapeHtml(links.scholar||'')}"></div>
      <div class="field-group"><label>ORCID URL</label><input class="input" id="pf-orcidurl" value="${escapeHtml(links.orcid||'')}"></div>
      <button class="btn-admin primary" id="pf-save">Enregistrer le profil</button>
    </div>
  `;
  el.querySelector('#pf-save').addEventListener('click', () => {
    DATA.profile = {
      name:     el.querySelector('#pf-name').value.trim(),
      title:    el.querySelector('#pf-title').value.trim(),
      tagline:  el.querySelector('#pf-tagline').value.trim(),
      about:    el.querySelector('#pf-about').value.trim(),
      location: el.querySelector('#pf-location').value.trim(),
      email:    el.querySelector('#pf-email').value.trim(),
      lab:      el.querySelector('#pf-lab').value.trim(),
      orcid:    el.querySelector('#pf-orcid').value.trim(),
      links: {
        email:    el.querySelector('#pf-email').value.trim(),
        github:   el.querySelector('#pf-github').value.trim(),
        linkedin: el.querySelector('#pf-linkedin').value.trim(),
        scholar:  el.querySelector('#pf-scholar').value.trim(),
        orcid:    el.querySelector('#pf-orcidurl').value.trim(),
      },
    };
    markDirty();
    renderCurrentPage();
    renderHeader(DATA);
    toast('Profil mis à jour ✓', 'success');
  });
}

/* --- LIST TAB (generic CRUD) --- */
function renderListTab(el, section) {
  const items = DATA[section] || [];
  const isEditing = adminEditId !== null;
  const editItem = isEditing ? items.find(i => i.id === adminEditId) : null;

  const listHtml = items.map(item => {
    const title = item.name || item.role || item.degree || item.title || item.id;
    const sub   = item.org || item.venue || item.category || item.level || '';
    return `
      <div class="admin-list-item">
        <div class="admin-list-item-body">
          <div class="admin-list-item-title">${escapeHtml(title)}</div>
          ${sub ? `<div class="admin-list-item-sub">${escapeHtml(sub)}</div>` : ''}
        </div>
        <div class="admin-list-item-actions">
          <button class="btn-admin edit-btn" data-id="${escapeHtml(item.id)}">Éditer</button>
          <button class="btn-admin danger del-btn" data-id="${escapeHtml(item.id)}">✕</button>
        </div>
      </div>`;
  }).join('') || '<div class="empty-state">Aucun élément.</div>';

  el.innerHTML = `
    <div class="admin-section-header">
      <h3>${items.length} élément(s)</h3>
      <button class="btn-admin primary" id="add-item-btn">+ Ajouter</button>
    </div>
    <div class="admin-list">${listHtml}</div>
    <div id="admin-edit-form"></div>
  `;

  el.querySelector('#add-item-btn').addEventListener('click', () => {
    adminEditId = '__new__';
    renderEditForm(el.querySelector('#admin-edit-form'), section, null);
  });

  el.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      adminEditId = btn.dataset.id;
      const item = DATA[section].find(i => i.id === adminEditId);
      renderEditForm(el.querySelector('#admin-edit-form'), section, item);
    });
  });

  el.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer cet élément ?')) return;
      DATA[section] = DATA[section].filter(i => i.id !== btn.dataset.id);
      markDirty();
      renderCurrentPage();
      renderAdminTabContent();
      toast('Élément supprimé.', 'info');
    });
  });

  // Re-render form if was editing
  if (isEditing && editItem) {
    renderEditForm(el.querySelector('#admin-edit-form'), section, editItem);
  }
}

/* --- EDIT FORM (per section) --- */
function renderEditForm(container, section, item) {
  const isNew = !item;
  container.innerHTML = `<div class="admin-form-section"><h4>${isNew ? 'Ajouter' : 'Modifier'}</h4>${getFormHtml(section, item)}</div>`;

  container.querySelector('#ef-cancel')?.addEventListener('click', () => {
    adminEditId = null;
    container.innerHTML = '';
  });

  container.querySelector('#ef-save')?.addEventListener('click', () => {
    const newItem = readFormValues(container, section, item);
    if (!newItem) return;
    if (isNew) {
      DATA[section] = DATA[section] || [];
      DATA[section].push(newItem);
    } else {
      const idx = DATA[section].findIndex(i => i.id === item.id);
      if (idx >= 0) DATA[section][idx] = newItem;
    }
    markDirty();
    renderCurrentPage();
    adminEditId = null;
    renderAdminTabContent();
    toast(isNew ? 'Élément ajouté ✓' : 'Élément mis à jour ✓', 'success');
  });

  // Implication category change → show/hide fields
  const catSel = container.querySelector('#ef-category');
  if (catSel) {
    catSel.addEventListener('change', () => toggleImplicationFields(container, catSel.value));
    toggleImplicationFields(container, catSel.value);
  }
}

function toggleImplicationFields(container, category) {
  const roleRow = container.querySelector('#ef-role-row');
  const amtRow  = container.querySelector('#ef-amount-row');
  if (roleRow)  roleRow.style.display = category === 'funding' ? 'none' : '';
  if (amtRow)   amtRow.style.display  = category === 'funding' ? ''     : 'none';
}

function getFormHtml(section, item) {
  const v = f => escapeHtml(item?.[f] || '');
  const skillCheckboxes = () => {
    return `<div class="field-group"><label>Compétences liées</label>
      <div class="skill-checkbox-grid">
        ${(DATA.skills || []).map(s => `
          <label class="skill-checkbox-label">
            <input type="checkbox" name="skill-link" value="${escapeHtml(s.id)}"
              ${(item?.skills || []).includes(s.id) ? 'checked' : ''}>
            ${escapeHtml(s.name)}
          </label>`).join('')}
      </div></div>`;
  };

  if (section === 'skills') return `
    <div class="admin-form">
      <div class="field-group"><label>Nom</label><input class="input" id="ef-name" value="${v('name')}" placeholder="Python"></div>
      <div class="form-row">
        <div class="field-group"><label>Catégorie</label>
          <select class="select" id="ef-category">
            <option value="hard"     ${item?.category==='hard'     ?'selected':''}>Technique</option>
            <option value="soft"     ${item?.category==='soft'     ?'selected':''}>Transversale</option>
            <option value="language" ${item?.category==='language' ?'selected':''}>Langue</option>
          </select>
        </div>
        <div class="field-group"><label>Niveau</label><input class="input" id="ef-level" value="${v('level')}" placeholder="avancé / C1 / …"></div>
      </div>
      <div class="admin-form-actions">
        <button class="btn-admin primary" id="ef-save">Enregistrer</button>
        <button class="btn-admin" id="ef-cancel">Annuler</button>
      </div>
    </div>`;

  if (section === 'experiences') return `
    <div class="admin-form">
      <div class="field-group"><label>Poste / Rôle</label><input class="input" id="ef-role" value="${v('role')}" placeholder="Doctorant en Neurosciences"></div>
      <div class="field-group"><label>Organisation</label><input class="input" id="ef-org" value="${v('org')}"></div>
      <div class="form-row">
        <div class="field-group"><label>Localisation</label><input class="input" id="ef-location" value="${v('location')}"></div>
        <div class="field-group"></div>
      </div>
      <div class="form-row">
        <div class="field-group"><label>Début (AAAA-MM)</label><input class="input" id="ef-start" value="${v('start')}" placeholder="2023-09"></div>
        <div class="field-group"><label>Fin (vide = en cours)</label><input class="input" id="ef-end" value="${v('end')}" placeholder="2024-06"></div>
      </div>
      <div class="field-group"><label>Description</label><textarea class="textarea" id="ef-description">${escapeHtml(item?.description||'')}</textarea></div>
      ${skillCheckboxes()}
      <div class="admin-form-actions">
        <button class="btn-admin primary" id="ef-save">Enregistrer</button>
        <button class="btn-admin" id="ef-cancel">Annuler</button>
      </div>
    </div>`;

  if (section === 'educations') return `
    <div class="admin-form">
      <div class="field-group"><label>Diplôme</label><input class="input" id="ef-degree" value="${v('degree')}" placeholder="Master Neurosciences"></div>
      <div class="field-group"><label>Établissement</label><input class="input" id="ef-org" value="${v('org')}"></div>
      <div class="form-row">
        <div class="field-group"><label>Début (AAAA-MM)</label><input class="input" id="ef-start" value="${v('start')}" placeholder="2021-09"></div>
        <div class="field-group"><label>Fin (vide = en cours)</label><input class="input" id="ef-end" value="${v('end')}" placeholder="2023-06"></div>
      </div>
      <div class="field-group"><label>Description</label><textarea class="textarea" id="ef-description">${escapeHtml(item?.description||'')}</textarea></div>
      ${skillCheckboxes()}
      <div class="admin-form-actions">
        <button class="btn-admin primary" id="ef-save">Enregistrer</button>
        <button class="btn-admin" id="ef-cancel">Annuler</button>
      </div>
    </div>`;

  if (section === 'publications') return `
    <div class="admin-form">
      <div class="field-group"><label>Titre</label><input class="input" id="ef-title" value="${v('title')}"></div>
      <div class="field-group"><label>Auteurs</label><input class="input" id="ef-authors" value="${v('authors')}" placeholder="Nom P., Co-auteur B."></div>
      <div class="form-row">
        <div class="field-group"><label>Année</label><input class="input" id="ef-year" type="number" value="${item?.year||new Date().getFullYear()}" min="1900" max="2100"></div>
        <div class="field-group"><label>Revue / Statut</label><input class="input" id="ef-venue" value="${v('venue')}" placeholder="Nature Neuroscience"></div>
      </div>
      <div class="form-row">
        <div class="field-group"><label>URL</label><input class="input" id="ef-url" value="${v('url')}" placeholder="https://…"></div>
        <div class="field-group"><label>DOI</label><input class="input" id="ef-doi" value="${v('doi')}" placeholder="10.xxxx/…"></div>
      </div>
      ${skillCheckboxes()}
      <div class="admin-form-actions">
        <button class="btn-admin primary" id="ef-save">Enregistrer</button>
        <button class="btn-admin" id="ef-cancel">Annuler</button>
      </div>
    </div>`;

  if (section === 'implications') return `
    <div class="admin-form">
      <div class="field-group"><label>Catégorie</label>
        <select class="select" id="ef-category">
          <option value="scientific" ${item?.category==='scientific'?'selected':''}>Implication scientifique collective</option>
          <option value="public"     ${item?.category==='public'    ?'selected':''}>Action grand public</option>
          <option value="funding"    ${item?.category==='funding'   ?'selected':''}>Financement obtenu</option>
        </select>
      </div>
      <div class="field-group"><label>Titre</label><input class="input" id="ef-title" value="${v('title')}"></div>
      <div class="field-group"><label>Organisation</label><input class="input" id="ef-org" value="${v('org')}"></div>
      <div id="ef-role-row" class="field-group"><label>Rôle</label><input class="input" id="ef-role" value="${v('role')}" placeholder="Co-organisateur, Reviewer…"></div>
      <div id="ef-amount-row" class="field-group" style="display:none;"><label>Montant</label><input class="input" id="ef-amount" value="${v('amount')}" placeholder="1 800 € / mois"></div>
      <div class="form-row">
        <div class="field-group"><label>Début (AAAA-MM)</label><input class="input" id="ef-start" value="${v('start')}"></div>
        <div class="field-group"><label>Fin (vide = en cours)</label><input class="input" id="ef-end" value="${v('end')}"></div>
      </div>
      <div class="field-group"><label>Description</label><textarea class="textarea" id="ef-description">${escapeHtml(item?.description||'')}</textarea></div>
      <div class="admin-form-actions">
        <button class="btn-admin primary" id="ef-save">Enregistrer</button>
        <button class="btn-admin" id="ef-cancel">Annuler</button>
      </div>
    </div>`;

  return '<p class="text-muted">Section non éditable ici.</p>';
}

function readFormValues(container, section, existingItem) {
  const get = id => container.querySelector('#' + id)?.value?.trim() || '';
  const id = existingItem?.id || (section.slice(0, 2) + '-' + uid());

  const linkedSkills = [...container.querySelectorAll('input[name="skill-link"]:checked')].map(cb => cb.value);

  if (section === 'skills') return {
    id, name: get('ef-name'), category: get('ef-category'), level: get('ef-level'),
  };
  if (section === 'experiences') return {
    id, role: get('ef-role'), org: get('ef-org'), location: get('ef-location'),
    start: get('ef-start'), end: get('ef-end') || null,
    description: get('ef-description'), type: 'experience', skills: linkedSkills,
  };
  if (section === 'educations') return {
    id, degree: get('ef-degree'), org: get('ef-org'),
    start: get('ef-start'), end: get('ef-end') || null,
    description: get('ef-description'), type: 'education', skills: linkedSkills,
  };
  if (section === 'publications') return {
    id, title: get('ef-title'), authors: get('ef-authors'),
    year: parseInt(get('ef-year')) || new Date().getFullYear(),
    venue: get('ef-venue'), url: get('ef-url'), doi: get('ef-doi'), skills: linkedSkills,
  };
  if (section === 'implications') {
    const category = get('ef-category');
    return {
      id, category, title: get('ef-title'), org: get('ef-org'),
      role:   category !== 'funding' ? get('ef-role')   : undefined,
      amount: category === 'funding'  ? get('ef-amount') : undefined,
      start: get('ef-start'), end: get('ef-end') || null,
      description: get('ef-description'),
    };
  }
  return null;
}

/* --- SYNC TAB --- */
function renderSyncTab(el) {
  const cfg = getGithubConfig();
  el.innerHTML = `
    <div class="sync-row">
      <p style="font-size:.87rem;color:var(--text-muted)">
        Synchronisez les modifications vers votre dépôt GitHub. Un Personal Access Token avec droits <code>repo</code> est requis.
      </p>
      <div class="field-group"><label>Dépôt (user/repo)</label><input class="input" id="gh-repo" value="${escapeHtml(cfg.repo)}" placeholder="username/portfolio"></div>
      <div class="field-group"><label>Personal Access Token</label><input class="input" id="gh-token" type="password" value="${escapeHtml(cfg.token)}" placeholder="ghp_…"></div>
      <div class="form-row">
        <div class="field-group"><label>Chemin fichier</label><input class="input" id="gh-path" value="${escapeHtml(cfg.path)}" placeholder="data.json"></div>
        <div class="field-group"><label>Branche</label><input class="input" id="gh-branch" value="${escapeHtml(cfg.branch)}" placeholder="main"></div>
      </div>
      <div class="sync-actions">
        <button class="btn-admin primary" id="sync-save-cfg">Enregistrer config</button>
        <button class="btn-admin" id="sync-push">⬆ Pousser vers GitHub</button>
      </div>
      <hr class="admin-divider">
      <div style="font-size:.82rem;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:8px;">Import / Export local</div>
      <div class="sync-actions">
        <button class="btn-admin" id="sync-export">⬇ Exporter JSON</button>
        <label class="btn-admin" style="cursor:pointer;">⬆ Importer JSON<input type="file" accept=".json" id="sync-import" style="display:none;"></label>
      </div>
      <hr class="admin-divider">
      <div style="font-size:.82rem;font-family:var(--font-mono);color:var(--text-muted);margin-bottom:8px;">Mot de passe admin</div>
      <div class="field-group"><label>Nouveau mot de passe</label><input class="input" id="new-pw" type="password" placeholder="Laisser vide = pas de changement"></div>
      <button class="btn-admin" id="change-pw">Changer le mot de passe</button>
    </div>
  `;

  el.querySelector('#sync-save-cfg').addEventListener('click', () => {
    saveGithubConfig({
      repo:   el.querySelector('#gh-repo').value.trim(),
      token:  el.querySelector('#gh-token').value.trim(),
      path:   el.querySelector('#gh-path').value.trim() || 'data.json',
      branch: el.querySelector('#gh-branch').value.trim() || 'main',
    });
    toast('Configuration GitHub sauvegardée.', 'success');
  });

  el.querySelector('#sync-push').addEventListener('click', syncToGithub);

  el.querySelector('#sync-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    toast('Export téléchargé.', 'success');
  });

  el.querySelector('#sync-import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      DATA = parsed;
      markDirty();
      renderCurrentPage();
      renderAdminTabContent();
      toast('Import réussi ✓', 'success');
    } catch {
      toast('Erreur lors de l\'import JSON.', 'error');
    }
  });

  el.querySelector('#change-pw').addEventListener('click', async () => {
    const pw = el.querySelector('#new-pw').value;
    if (!pw) return toast('Entrez un nouveau mot de passe.', 'error');
    const hash = await sha256(pw);
    DATA.meta = DATA.meta || {};
    DATA.meta.passwordHash = hash;
    markDirty();
    toast('Mot de passe changé. N\'oubliez pas de sauvegarder.', 'success');
    el.querySelector('#new-pw').value = '';
  });
}

/* =========================================================
   ADMIN — URL hash trigger
   ========================================================= */
function checkAdminHash() {
  if (window.location.hash === '#admin') {
    history.replaceState(null, '', window.location.pathname);
    showAdminLock();
  }
}

/* =========================================================
   RE-RENDER CURRENT PAGE
   ========================================================= */
function renderCurrentPage() {
  // Clear D3 graph before re-render
  svgSel = null;
  graphSim = null;

  const page = document.body.dataset.page;
  switch (page) {
    case 'home':         renderHome(DATA); break;
    case 'cursus':       renderCursus(DATA); break;
    case 'experiences':  renderExperiences(DATA); break;
    case 'publications': renderPublications(DATA); break;
    case 'implications': renderImplications(DATA); break;
    case 'contact':      renderContact(DATA); break;
  }
}

/* =========================================================
   INIT
   ========================================================= */
async function init() {
  initTheme();
  const data = await loadData();

  renderHeader(data);
  renderFooter(data);
  renderCurrentPage();
  checkAdminHash();
}

init();
