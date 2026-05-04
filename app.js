/* ==============================================================
   PORTFOLIO — LOGIQUE PRINCIPALE
   ============================================================== */

/* ---------- CONFIG ---------- */
const CONFIG = {
  defaultPassword: "admin",
  dataUrl: "./data.json",
};

/* Liens par défaut = ancres locales sur la page d'accueil.
   Les pages MPA (Phase 2) passeront leurs propres liens à mountHeader(). */
const DEFAULT_NAV_LINKS = [
  { href: "#about",        label: "À propos",     id: "about" },
  { href: "#skills",       label: "Compétences",  id: "skills" },
  { href: "#experience",   label: "Parcours",     id: "experience" },
  { href: "#publications", label: "Publications", id: "publications" },
  { href: "#contact",      label: "Contact",      id: "contact" },
];

/* ---------- ÉTAT GLOBAL ---------- */
let DATA = null;
let ORIGINAL_DATA_HASH = "";
let isAdmin = false;
let activeSkill = null;
let activeItem = null;
let currentTab = "profile";
let editingEntity = null;

/* ---------- UTILS ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const fmtDate = (iso) => {
  if (!iso) return "aujourd'hui";
  const [y, m] = iso.split("-");
  const months = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
  return m ? `${months[parseInt(m)-1]} ${y}` : y;
};

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

const uid = (prefix="x") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;

const toast = (msg, type="") => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = "toast", 3200);
};

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

/* ==============================================================
   INJECTION DU HEADER (partagé entre toutes les pages MPA)
   ============================================================== */
function mountHeader({ active = null, links = DEFAULT_NAV_LINKS } = {}) {
  const host = $("#siteHeader");
  if (!host) return;
  host.outerHTML = `
    <header class="site" id="siteHeader">
      <div class="wrap">
        <nav>
          <a href="index.html" class="brand">
            <span class="brand-mark" id="brandMark" title="Triple-clic pour admin"></span>
            <span id="brandName">Portfolio</span>
          </a>
          <ul>
            ${links.map(l => `<li><a href="${escapeHtml(l.href)}" ${l.id === active ? 'class="active"' : ''}>${escapeHtml(l.label)}</a></li>`).join("")}
          </ul>
          <div class="nav-actions">
            <button class="icon-btn theme-toggle" id="themeToggle" aria-label="Changer de thème">
              <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
              <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </button>
          </div>
        </nav>
      </div>
    </header>`;
}

/* ==============================================================
   INJECTION DE L'UI ADMIN (lock + panel + toast)
   ============================================================== */
function mountAdminUI() {
  const host = $("#adminUI");
  if (!host) return;
  host.outerHTML = `
    <div id="adminUI">
      <div class="admin-lock" id="adminLock">
        <div class="admin-lock-box">
          <h2>Mode édition</h2>
          <p>Entrez le mot de passe pour modifier le contenu du portfolio.</p>
          <input type="password" id="adminPwd" placeholder="Mot de passe" autocomplete="off" />
          <div class="err" id="adminErr"></div>
          <div class="actions">
            <button class="btn" id="adminCancel">Annuler</button>
            <button class="btn primary" id="adminSubmit">Déverrouiller</button>
          </div>
        </div>
      </div>

      <aside class="admin-panel" id="adminPanel">
        <div class="admin-head">
          <h2>Éditeur</h2>
          <div style="display:flex; gap:10px; align-items:center;">
            <span class="admin-status" id="adminStatus">prêt</span>
            <button class="btn small" id="adminClose">Fermer</button>
          </div>
        </div>
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="profile">Profil</button>
          <button class="admin-tab" data-tab="skills">Compétences</button>
          <button class="admin-tab" data-tab="cursus">Cursus</button>
          <button class="admin-tab" data-tab="experiences">Expériences</button>
          <button class="admin-tab" data-tab="publications">Publications</button>
          <button class="admin-tab" data-tab="sync">Synchronisation</button>
        </div>
        <div class="admin-body" id="adminBody"></div>
        <div class="admin-foot">
          <button class="btn" id="adminExport">Exporter JSON</button>
          <button class="btn primary" id="adminSave">Enregistrer sur GitHub</button>
        </div>
      </aside>

      <div class="toast" id="toast"></div>
    </div>`;
}

/* ==============================================================
   CHARGEMENT DES DONNÉES
   ============================================================== */
async function loadData() {
  try {
    const res = await fetch(CONFIG.dataUrl + "?t=" + Date.now());
    if (!res.ok) throw new Error("fetch failed");
    DATA = await res.json();
  } catch (e) {
    console.warn("Impossible de charger data.json, utilisation des données par défaut.", e);
    DATA = getDefaultData();
  }
  ORIGINAL_DATA_HASH = await sha256(JSON.stringify(DATA));
  renderAll();
}

function getDefaultData() {
  return {
    profile: {
      name: "Votre Nom", title: "Doctorant·e en Neurosciences",
      tagline: "Portfolio en construction.", about: "Ajoutez votre bio ici.",
      location: "", email: "", lab: "", orcid: "",
      links: { email: "", github: "", linkedin: "", scholar: "", orcid: "" }
    },
    skills: [], experiences: [], cursus: [], formations: [], rayonnement: [], financements: [], publications: [],
    meta: { lastUpdated: new Date().toISOString().slice(0,10), version: 1 }
  };
}

/* ==============================================================
   RENDU DE TOUTES LES SECTIONS
   ============================================================== */
function renderAll() {
  renderProfile();
  if ($("#aboutText"))      renderAbout();
  if ($("#skillsGrid"))     renderSkills();
  if ($("#skillsGraph"))    renderGraph();
  if ($("#experienceList") || $("#educationList")) renderTimeline();
  if ($("#pubsList"))       renderPublications();
  if ($("#contactBig"))     renderContact();
  setTimeout(revealOnScroll, 100);
}

/* ---------- PROFIL / HERO ---------- */
function renderProfile() {
  const p = DATA.profile;
  if ($("#brandName"))    $("#brandName").textContent = p.name || "Portfolio";
  if ($("#heroStatus"))   $("#heroStatus").textContent = p.title || "";
  if ($("#heroTitle"))    $("#heroTitle").innerHTML = p.tagline
    ? p.tagline.replace(/\*([^*]+)\*/g, "<em>$1</em>")
    : "Bienvenue.";
  if ($("#heroSub"))      $("#heroSub").textContent = p.about ? p.about.split("\n")[0] : "";

  if ($("#heroLocation")) $("#heroLocation").innerHTML = p.location ? `📍 ${escapeHtml(p.location)}` : "";
  if ($("#heroLab"))      $("#heroLab").innerHTML      = p.lab      ? `🔬 ${escapeHtml(p.lab)}` : "";
  if ($("#heroEmail"))    $("#heroEmail").innerHTML    = p.email    ? `✉ <a href="mailto:${escapeHtml(p.email)}" style="color:inherit; border-bottom:1px solid currentColor">${escapeHtml(p.email)}</a>` : "";

  if ($("#footName"))     $("#footName").textContent = p.name || "";
  if ($("#footYear"))     $("#footYear").textContent = new Date().getFullYear();
  document.title = `${p.name || "Portfolio"} — ${p.title || ""}`;
}

/* ---------- À PROPOS ---------- */
function renderAbout() {
  const p = DATA.profile;
  const paragraphs = (p.about || "").split(/\n\n+/).map(t => `<p>${escapeHtml(t).replace(/\n/g,"<br>")}</p>`).join("");
  $("#aboutText").innerHTML = paragraphs || "<p class='empty-note'>Biographie non renseignée.</p>";

  const facts = [
    ["Nom", p.name],
    ["Poste", p.title],
    ["Laboratoire", p.lab],
    ["Lieu", p.location],
    ["Email", p.email ? `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : ""],
    ["ORCID", p.orcid ? `<a href="${escapeHtml(p.links?.orcid || '#')}" target="_blank" rel="noopener">${escapeHtml(p.orcid)}</a>` : ""]
  ].filter(([_, v]) => v);

  if ($("#factsList")) $("#factsList").innerHTML = facts.map(([k, v]) => `
    <div class="fact"><dt>${k}</dt><dd>${v}</dd></div>
  `).join("");
}

/* ---------- COMPÉTENCES — CARTES ---------- */
function renderSkills() {
  const grid = $("#skillsGrid");
  const groups = {
    hard:     { title: "Techniques",   idx: "01", skills: [] },
    soft:     { title: "Transversales", idx: "02", skills: [] },
    language: { title: "Langues",      idx: "03", skills: [] },
  };
  (DATA.skills || []).forEach(s => { (groups[s.category] || groups.hard).skills.push(s); });

  grid.innerHTML = Object.entries(groups)
    .filter(([_, g]) => g.skills.length)
    .map(([cat, g]) => `
      <div class="skill-card" data-cat="${cat}">
        <h3>${g.title}<span class="idx">${g.idx}</span></h3>
        <ul>
          ${g.skills.map(s => `
            <li data-skill-id="${s.id}" tabindex="0">
              <span>${escapeHtml(s.name)}</span>
              <span class="level">${escapeHtml(s.level || "")}</span>
            </li>`).join("")}
        </ul>
      </div>
    `).join("");

  if (!(DATA.skills || []).length) {
    grid.innerHTML = `<div class="empty-note">Aucune compétence n'a encore été ajoutée.</div>`;
  }

  $$('#skillsGrid li[data-skill-id]').forEach(li => {
    li.addEventListener("click", () => selectSkill(li.dataset.skillId));
  });
}

/* ---------- TIMELINE (Expérience + Formation) ---------- */
function renderTimeline() {
  const renderItems = (items, type) => {
    if (!items.length) return `<div class="empty-note">Rien à afficher.</div>`;
    return items
      .slice()
      .sort((a, b) => (b.start || "").localeCompare(a.start || ""))
      .map(item => {
        const name = item.title || item.role || item.degree || "";
        return `
          <div class="tl-item" data-item-id="${item.id}" data-type="${type}">
            <div class="tl-date">${fmtDate(item.start)} — ${fmtDate(item.end)}</div>
            <div class="tl-role">${escapeHtml(name)}</div>
            <div class="tl-org">${escapeHtml(item.org || "")}</div>
            <div class="tl-desc">${escapeHtml(item.description || "")}</div>
            <div class="tl-skills">
              ${(item.skills || []).map(sid => {
                const sk = DATA.skills.find(s => s.id === sid);
                return sk ? `<span class="chip" data-skill-id="${sid}">${escapeHtml(sk.name)}</span>` : "";
              }).join("")}
            </div>
          </div>`;
      }).join("");
  };

  if ($("#experienceList")) $("#experienceList").innerHTML = renderItems(DATA.experiences || [], "experience");
  if ($("#educationList"))  $("#educationList").innerHTML  = renderItems(DATA.cursus       || [], "education");

  $$(".tl-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("chip")) return;
      selectItem(el.dataset.itemId);
    });
  });
  $$(".tl-item .chip").forEach(c => {
    c.addEventListener("click", (e) => {
      e.stopPropagation();
      selectSkill(c.dataset.skillId);
    });
  });
}

/* ---------- PUBLICATIONS ---------- */
function renderPublications() {
  const list = $("#pubsList");
  const pubs = (DATA.publications || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  if (!pubs.length) {
    list.innerHTML = `<div class="empty-note">Pas encore de publication.</div>`;
    return;
  }
  list.innerHTML = pubs.map(p => `
    <div class="pub" data-item-id="${p.id}">
      <div class="pub-year">${escapeHtml(String(p.year || ""))}</div>
      <div>
        <div class="pub-title">${escapeHtml(p.title || "")}</div>
        <div class="pub-authors">${escapeHtml(p.authors || "")}</div>
        <div class="pub-venue">${escapeHtml(p.venue || "")}</div>
        <div class="tl-skills">
          ${(p.skills || []).map(sid => {
            const sk = DATA.skills.find(s => s.id === sid);
            return sk ? `<span class="chip" data-skill-id="${sid}">${escapeHtml(sk.name)}</span>` : "";
          }).join("")}
        </div>
      </div>
      ${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="pub-link">Lire ↗</a>` : `<span></span>`}
    </div>
  `).join("");

  $$('.pub').forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("pub-link") || e.target.classList.contains("chip")) return;
      selectItem(el.dataset.itemId);
    });
  });
  $$('.pub .chip').forEach(c => {
    c.addEventListener("click", (e) => { e.stopPropagation(); selectSkill(c.dataset.skillId); });
  });
}

/* ---------- CONTACT ---------- */
function renderContact() {
  const p = DATA.profile;
  $("#contactBig").innerHTML = p.email
    ? `Un projet, une collaboration, une question ? <a href="mailto:${escapeHtml(p.email)}">Écrivez-moi.</a>`
    : `Contact à renseigner.`;

  const links = [
    ["Email",    p.links?.email    ? `mailto:${p.links.email}` : (p.email ? `mailto:${p.email}` : ""), p.email || p.links?.email || ""],
    ["GitHub",   p.links?.github,   p.links?.github],
    ["LinkedIn", p.links?.linkedin, p.links?.linkedin],
    ["Scholar",  p.links?.scholar,  p.links?.scholar],
    ["ORCID",    p.links?.orcid,    p.orcid || p.links?.orcid]
  ].filter(([_, url]) => url);

  $("#contactLinks").innerHTML = links.map(([label, url, display]) => `
    <a class="contact-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      <span class="label">${label}</span>
      <span class="value">${escapeHtml((display || url).replace(/^mailto:/, ""))}</span>
    </a>
  `).join("");
}

/* ==============================================================
   SÉLECTION / MISE EN ÉVIDENCE CROISÉE
   ============================================================== */
function selectSkill(skillId) {
  if (activeSkill === skillId) {
    clearSelection();
    return;
  }
  activeSkill = skillId;
  activeItem = null;

  const relatedItems = [
    ...(DATA.experiences  || []).filter(e => (e.skills || []).includes(skillId)),
    ...(DATA.cursus       || []).filter(e => (e.skills || []).includes(skillId)),
    ...(DATA.publications || []).filter(p => (p.skills || []).includes(skillId)),
  ].map(x => x.id);

  applyHighlight({ skillIds: [skillId], itemIds: relatedItems });

  const sk = DATA.skills.find(s => s.id === skillId);
  toast(`${sk?.name || "Compétence"} — ${relatedItems.length} élément(s) lié(s)`);
}

function selectItem(itemId) {
  if (activeItem === itemId) {
    clearSelection();
    return;
  }
  activeItem = itemId;
  activeSkill = null;

  const all = [...(DATA.experiences||[]), ...(DATA.cursus||[]), ...(DATA.publications||[])];
  const item = all.find(x => x.id === itemId);
  if (!item) return;

  applyHighlight({ skillIds: item.skills || [], itemIds: [itemId] });
  toast(`${item.title || item.role || item.degree || ""} — ${(item.skills || []).length} compétence(s)`);
}

function clearSelection() {
  activeSkill = null; activeItem = null;
  applyHighlight({ skillIds: [], itemIds: [] });
}

function applyHighlight({ skillIds, itemIds }) {
  const hasSelection = skillIds.length || itemIds.length;

  $$('#skillsGrid li[data-skill-id]').forEach(li => {
    li.classList.toggle("highlighted", skillIds.includes(li.dataset.skillId));
  });

  $$('.tl-item, .pub').forEach(el => {
    el.classList.toggle("highlighted", itemIds.includes(el.dataset.itemId));
  });

  $$('.chip[data-skill-id]').forEach(c => {
    c.classList.toggle("highlighted", skillIds.includes(c.dataset.skillId));
  });

  if (graphApi) graphApi.highlight({ skillIds, itemIds, hasSelection });
}

/* ==============================================================
   GRAPHE D3 — RÉSEAU DE COMPÉTENCES
   ============================================================== */
let graphApi = null;

function renderGraph() {
  if (typeof d3 === "undefined") return;
  const svg = d3.select("#skillsGraph");
  if (svg.empty() || !svg.node()) return;
  svg.selectAll("*").remove();
  const container = svg.node().parentNode;
  const w = container.clientWidth;
  const h = svg.node().clientHeight;
  svg.attr("viewBox", `0 0 ${w} ${h}`);

  const g = svg.append("g");

  const zoom = d3.zoom().scaleExtent([0.3, 3])
    .on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoom);

  const skillNodes = (DATA.skills || []).map(s => ({
    id: s.id, label: s.name, type: "skill", category: s.category
  }));
  const itemNodes = [
    ...(DATA.experiences || []).map(e => ({ id: e.id, label: e.title || "?", type: "item", kind: "experience" })),
    ...(DATA.cursus      || []).map(e => ({ id: e.id, label: e.title || "?", type: "item", kind: "education" })),
    ...(DATA.publications|| []).map(p => ({ id: p.id, label: p.title || "?", type: "item", kind: "publication" })),
  ];
  const nodes = [...skillNodes, ...itemNodes];

  const links = [];
  const addLinks = (arr) => (arr || []).forEach(item =>
    (item.skills || []).forEach(sid => {
      if (nodes.find(n => n.id === sid)) links.push({ source: item.id, target: sid });
    })
  );
  addLinks(DATA.experiences); addLinks(DATA.cursus); addLinks(DATA.publications);

  if (!nodes.length) {
    g.append("text").attr("x", w/2).attr("y", h/2).attr("text-anchor", "middle")
      .attr("fill", "var(--muted)").attr("font-family", "Fraunces, serif").attr("font-style", "italic")
      .text("Ajoutez des compétences et expériences pour voir le graphe.");
    return;
  }

  const colorFor = (n) => {
    if (n.type === "item") return "var(--ink)";
    if (n.category === "hard") return "var(--accent)";
    if (n.category === "soft") return "var(--accent-2)";
    if (n.category === "language") return "#2a9d5c";
    return "var(--accent)";
  };
  const radiusFor = (n) => n.type === "item" ? 10 : 8;

  const sim = d3.forceSimulation(nodes)
    .force("link",   d3.forceLink(links).id(d => d.id).distance(80).strength(.4))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(w/2, h/2))
    .force("collide",d3.forceCollide().radius(d => radiusFor(d) + 14));

  const link = g.append("g").attr("class", "links")
    .selectAll("line").data(links).join("line")
    .attr("class", "link")
    .attr("stroke", "var(--line)")
    .attr("stroke-width", 1);

  const node = g.append("g").attr("class", "nodes")
    .selectAll("g.node").data(nodes).join("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append("circle")
    .attr("r", d => radiusFor(d))
    .attr("fill", d => d.type === "item" ? "var(--bg-elev)" : colorFor(d))
    .attr("stroke", d => d.type === "item" ? colorFor({ type: "skill", category: "hard" }) : "none")
    .attr("stroke-width", d => d.type === "item" ? 2 : 0);

  node.append("text")
    .attr("dx", d => radiusFor(d) + 6)
    .attr("dy", 4)
    .text(d => d.label.length > 32 ? d.label.slice(0, 30) + "…" : d.label);

  node.on("click", (e, d) => {
    e.stopPropagation();
    if (d.type === "skill") selectSkill(d.id);
    else selectItem(d.id);
  });

  svg.on("click", () => clearSelection());

  sim.on("tick", () => {
    link
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  graphApi = {
    highlight({ skillIds, itemIds, hasSelection }) {
      const sel = new Set([...skillIds, ...itemIds]);
      node.classed("dim", d => hasSelection && !sel.has(d.id))
          .classed("highlighted", d => sel.has(d.id));
      link.classed("dim", l => hasSelection && !sel.has(l.source.id) && !sel.has(l.target.id))
          .classed("highlighted", l => sel.has(l.source.id) && sel.has(l.target.id));
      node.select("circle").attr("stroke", d => {
        if (sel.has(d.id)) return "var(--accent)";
        return d.type === "item" ? colorFor({ type: "skill", category: "hard" }) : "none";
      });
    }
  };
}

/* ==============================================================
   REVEAL ON SCROLL
   ============================================================== */
function revealOnScroll() {
  const els = $$(".wrap > *, section");
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: .1 });
  els.forEach(e => { e.classList.add("reveal"); io.observe(e); });
}

/* ==============================================================
   THÈME
   ============================================================== */
function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefers ? "dark" : "light");
  $("#themeToggle")?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    if ($("#skillsGraph")) renderGraph();
  });
}

/* ==============================================================
   MODE ADMIN — ACCÈS
   ============================================================== */
function initAdminAccess() {
  let clicks = 0, timer = null;
  $("#brandMark")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => clicks = 0, 600);
    if (clicks >= 3) {
      clicks = 0;
      openAdminLock();
    }
  });

  if (location.hash === "#admin") openAdminLock();

  $("#adminCancel")?.addEventListener("click", closeAdminLock);
  $("#adminSubmit")?.addEventListener("click", tryUnlock);
  $("#adminPwd")?.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  $("#adminClose")?.addEventListener("click", () => $("#adminPanel").classList.remove("open"));
}

function openAdminLock() {
  $("#adminLock").classList.add("active");
  $("#adminErr").textContent = "";
  setTimeout(() => $("#adminPwd").focus(), 100);
}
function closeAdminLock() {
  $("#adminLock").classList.remove("active");
  $("#adminPwd").value = "";
}

async function tryUnlock() {
  const pwd = $("#adminPwd").value;
  const saved = DATA.meta?.passwordHash;
  const ok = saved
    ? (await sha256(pwd)) === saved
    : pwd === CONFIG.defaultPassword;

  if (!ok) {
    $("#adminErr").textContent = "Mot de passe incorrect.";
    return;
  }
  isAdmin = true;
  closeAdminLock();
  $("#adminPanel").classList.add("open");
  renderAdminTab();
}

/* ==============================================================
   PANNEAU ADMIN — ONGLETS
   ============================================================== */
function initAdminPanel() {
  $$(".admin-tab").forEach(t => {
    t.addEventListener("click", () => {
      $$(".admin-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      currentTab = t.dataset.tab;
      editingEntity = null;
      renderAdminTab();
    });
  });

  $("#adminExport")?.addEventListener("click", exportJson);
  $("#adminSave")?.addEventListener("click", saveToGithub);
}

function renderAdminTab() {
  const body = $("#adminBody");
  switch (currentTab) {
    case "profile":      body.innerHTML = renderProfileForm(); bindProfileForm(); break;
    case "skills":       body.innerHTML = renderEntityList("skills", "Compétence");      bindEntityList("skills"); break;
    case "experiences":  body.innerHTML = renderEntityList("experiences", "Expérience"); bindEntityList("experiences"); break;
    case "cursus":       body.innerHTML = renderEntityList("cursus", "Cursus");          bindEntityList("cursus"); break;
    case "publications": body.innerHTML = renderEntityList("publications", "Publication"); bindEntityList("publications"); break;
    case "sync":         body.innerHTML = renderSyncForm(); bindSyncForm(); break;
  }
}

/* ---------- Onglet Profil ---------- */
function renderProfileForm() {
  const p = DATA.profile || {};
  const l = p.links || {};
  return `
    <h3>Informations personnelles</h3>
    <p class="hint">Modifiez les éléments affichés en en-tête, dans l'hero et la section « À propos ».</p>
    <div class="admin-form">
      <div class="row">
        <label>Nom complet <input type="text" name="name" value="${escapeHtml(p.name)}"></label>
        <label>Poste / Titre <input type="text" name="title" value="${escapeHtml(p.title)}"></label>
      </div>
      <label>Phrase d'accroche (titre du hero — encadrez avec * un mot à mettre en italique coloré) <input type="text" name="tagline" value="${escapeHtml(p.tagline)}"></label>
      <label>Bio complète (À propos — double saut de ligne = nouveau paragraphe) <textarea name="about" rows="6">${escapeHtml(p.about)}</textarea></label>
      <div class="row">
        <label>Lieu <input type="text" name="location" value="${escapeHtml(p.location)}"></label>
        <label>Laboratoire <input type="text" name="lab" value="${escapeHtml(p.lab)}"></label>
      </div>
      <div class="row">
        <label>Email <input type="email" name="email" value="${escapeHtml(p.email)}"></label>
        <label>ORCID ID <input type="text" name="orcid" value="${escapeHtml(p.orcid)}"></label>
      </div>
      <h3 style="margin-top:8px">Liens externes</h3>
      <div class="row">
        <label>GitHub <input type="url" name="link-github" value="${escapeHtml(l.github)}"></label>
        <label>LinkedIn <input type="url" name="link-linkedin" value="${escapeHtml(l.linkedin)}"></label>
      </div>
      <div class="row">
        <label>Google Scholar <input type="url" name="link-scholar" value="${escapeHtml(l.scholar)}"></label>
        <label>ORCID (URL) <input type="url" name="link-orcid" value="${escapeHtml(l.orcid)}"></label>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px">
        <button class="btn primary" id="profileApply">Appliquer</button>
      </div>
    </div>
  `;
}

function bindProfileForm() {
  $("#profileApply").addEventListener("click", () => {
    const f = $("#adminBody");
    DATA.profile = DATA.profile || { links: {} };
    DATA.profile.links = DATA.profile.links || {};
    ["name","title","tagline","about","location","lab","email","orcid"].forEach(k => {
      DATA.profile[k] = f.querySelector(`[name="${k}"]`).value.trim();
    });
    ["github","linkedin","scholar","orcid"].forEach(k => {
      DATA.profile.links[k] = f.querySelector(`[name="link-${k}"]`).value.trim();
    });
    DATA.profile.links.email = DATA.profile.email;
    renderAll();
    toast("Profil mis à jour (non enregistré sur GitHub)");
    markDirty();
  });
}

/* ---------- Onglets Entités (compétences, exp, cursus, pubs) ---------- */
function renderEntityList(key, label) {
  const items = DATA[key] || [];
  const describe = (it) => {
    if (key === "skills")       return { t: it.name, s: `${it.category} · ${it.level || ""}` };
    if (key === "experiences")  return { t: it.title || it.role   || "(sans titre)", s: `${it.org || ""} — ${fmtDate(it.start)}` };
    if (key === "cursus")       return { t: it.title || it.degree || "(sans titre)", s: `${it.org || ""} — ${fmtDate(it.start)}` };
    if (key === "publications") return { t: it.title || "(sans titre)", s: `${it.year || ""} — ${it.venue || ""}` };
    return { t: "?", s: "" };
  };

  return `
    <h3>${label}s</h3>
    <p class="hint">Cliquez sur un élément pour le modifier, ou ajoutez-en un nouveau.</p>
    <div class="admin-list">
      ${items.length ? items.map(it => {
        const d = describe(it);
        return `
          <div class="admin-item" data-id="${it.id}">
            <div class="admin-item-info">
              <div class="t">${escapeHtml(d.t)}</div>
              <div class="s">${escapeHtml(d.s)}</div>
            </div>
            <div class="actions">
              <button class="btn small" data-act="edit">Éditer</button>
              <button class="btn small danger" data-act="delete">✕</button>
            </div>
          </div>`;
      }).join("") : `<div class="empty-note">Aucun élément.</div>`}
    </div>
    <div style="display:flex; gap:8px; margin-bottom:24px">
      <button class="btn primary" id="addEntity">+ Ajouter ${label.toLowerCase()}</button>
    </div>
    <div id="entityForm"></div>
  `;
}

function bindEntityList(key) {
  $$(`.admin-item`).forEach(el => {
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      const id = el.dataset.id;
      const item = (DATA[key] || []).find(x => x.id === id);
      if (!item) return;
      if (btn?.dataset.act === "delete") {
        if (confirm("Supprimer cet élément ?")) {
          DATA[key] = DATA[key].filter(x => x.id !== id);
          renderAll(); renderAdminTab(); markDirty();
          toast("Supprimé");
        }
      } else {
        editingEntity = item;
        $("#entityForm").innerHTML = renderEntityForm(key, item);
        bindEntityForm(key);
        $("#entityForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  $("#addEntity")?.addEventListener("click", () => {
    editingEntity = null;
    $("#entityForm").innerHTML = renderEntityForm(key, null);
    bindEntityForm(key);
    $("#entityForm").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderEntityForm(key, item) {
  const it = item || {};
  const skillOptions = (DATA.skills || []).map(s =>
    `<label><input type="checkbox" name="skill" value="${s.id}" ${(it.skills||[]).includes(s.id) ? "checked" : ""}> ${escapeHtml(s.name)}</label>`
  ).join("");

  if (key === "skills") {
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier la compétence" : "Nouvelle compétence"}</h3>
        <label>Nom <input type="text" name="name" value="${escapeHtml(it.name)}" required></label>
        <div class="row">
          <label>Catégorie
            <select name="category">
              <option value="hard"     ${it.category==="hard"?"selected":""}>Technique (hard)</option>
              <option value="soft"     ${it.category==="soft"?"selected":""}>Transversale (soft)</option>
              <option value="language" ${it.category==="language"?"selected":""}>Langue</option>
            </select>
          </label>
          <label>Niveau <input type="text" name="level" value="${escapeHtml(it.level)}" placeholder="ex. avancé, C1…"></label>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          ${item ? `<button class="btn" id="cancelEdit">Annuler</button>` : ""}
          <button class="btn primary" id="saveEntity">${item ? "Mettre à jour" : "Ajouter"}</button>
        </div>
      </div>`;
  }

  if (key === "experiences" || key === "cursus") {
    const titleLabel = key === "experiences" ? "Poste / Rôle" : "Diplôme";
    const titleVal = it.title || it.role || it.degree || "";
    const titleField = `<label>${titleLabel} <input type="text" name="title" value="${escapeHtml(titleVal)}" required></label>`;
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier" : "Nouveau"}</h3>
        ${titleField}
        <label>Organisation / École <input type="text" name="org" value="${escapeHtml(it.org)}"></label>
        <div class="row">
          <label>Début (AAAA-MM) <input type="text" name="start" value="${escapeHtml(it.start)}" placeholder="2023-09"></label>
          <label>Fin (vide = aujourd'hui) <input type="text" name="end" value="${escapeHtml(it.end)}" placeholder="2025-06"></label>
        </div>
        <label>Lieu <input type="text" name="location" value="${escapeHtml(it.location)}"></label>
        <label>Description <textarea name="description">${escapeHtml(it.description)}</textarea></label>
        <label>Compétences liées
          <div class="checkbox-grid">${skillOptions || "<span style='color:var(--muted); font-size:.8rem'>Ajoutez d'abord des compétences.</span>"}</div>
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          ${item ? `<button class="btn" id="cancelEdit">Annuler</button>` : ""}
          <button class="btn primary" id="saveEntity">${item ? "Mettre à jour" : "Ajouter"}</button>
        </div>
      </div>`;
  }

  if (key === "publications") {
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier la publication" : "Nouvelle publication"}</h3>
        <label>Titre <input type="text" name="title" value="${escapeHtml(it.title)}" required></label>
        <div class="row">
          <label>Année <input type="number" name="year" value="${escapeHtml(it.year)}" min="1900" max="2100"></label>
          <label>Revue / Venue <input type="text" name="venue" value="${escapeHtml(it.venue)}"></label>
        </div>
        <label>Auteurs <input type="text" name="authors" value="${escapeHtml(it.authors)}" placeholder="Nom P., Co-auteur A."></label>
        <label>URL (DOI, PDF…) <input type="url" name="url" value="${escapeHtml(it.url)}"></label>
        <label>Compétences liées
          <div class="checkbox-grid">${skillOptions || "<span style='color:var(--muted); font-size:.8rem'>Ajoutez d'abord des compétences.</span>"}</div>
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          ${item ? `<button class="btn" id="cancelEdit">Annuler</button>` : ""}
          <button class="btn primary" id="saveEntity">${item ? "Mettre à jour" : "Ajouter"}</button>
        </div>
      </div>`;
  }
  return "";
}

function bindEntityForm(key) {
  const form = $("#entityForm");
  if (!form) return;

  $("#cancelEdit")?.addEventListener("click", () => {
    editingEntity = null;
    $("#entityForm").innerHTML = "";
  });

  $("#saveEntity")?.addEventListener("click", () => {
    const obj = editingEntity ? { ...editingEntity } : { id: uid(key.slice(0,1)) };

    if (key === "skills") {
      obj.name = form.querySelector('[name="name"]').value.trim();
      obj.category = form.querySelector('[name="category"]').value;
      obj.level = form.querySelector('[name="level"]').value.trim();
      if (!obj.name) { toast("Nom requis", "error"); return; }
    }
    if (key === "experiences" || key === "cursus") {
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.org = form.querySelector('[name="org"]').value.trim();
      obj.start = form.querySelector('[name="start"]').value.trim();
      obj.end = form.querySelector('[name="end"]').value.trim() || null;
      obj.location = form.querySelector('[name="location"]').value.trim();
      obj.description = form.querySelector('[name="description"]').value.trim();
      obj.type = key === "experiences" ? "experience" : "education";
      obj.subItems = editingEntity?.subItems || [];
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }
    if (key === "publications") {
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.year = parseInt(form.querySelector('[name="year"]').value) || null;
      obj.venue = form.querySelector('[name="venue"]').value.trim();
      obj.authors = form.querySelector('[name="authors"]').value.trim();
      obj.url = form.querySelector('[name="url"]').value.trim();
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }

    DATA[key] = DATA[key] || [];
    if (editingEntity) {
      const idx = DATA[key].findIndex(x => x.id === editingEntity.id);
      DATA[key][idx] = obj;
    } else {
      DATA[key].push(obj);
    }
    editingEntity = null;
    renderAll();
    renderAdminTab();
    markDirty();
    toast(`Enregistré localement — n'oubliez pas de « Enregistrer sur GitHub »`);
  });
}

/* ---------- Onglet Sync (GitHub + mot de passe) ---------- */
function renderSyncForm() {
  const cfg = JSON.parse(localStorage.getItem("ghConfig") || "{}");
  return `
    <h3>Synchronisation GitHub</h3>
    <p class="hint">Le site commit les modifications directement dans votre <code>data.json</code> sur GitHub. Configurez l'accès une seule fois (le token reste stocké dans votre navigateur uniquement).</p>
    <div class="admin-form">
      <div class="row">
        <label>Propriétaire (username) <input type="text" name="owner" value="${escapeHtml(cfg.owner || "")}" placeholder="votrepseudo"></label>
        <label>Nom du repo <input type="text" name="repo" value="${escapeHtml(cfg.repo || "")}" placeholder="portfolio"></label>
      </div>
      <div class="row">
        <label>Branche <input type="text" name="branch" value="${escapeHtml(cfg.branch || "main")}" placeholder="main"></label>
        <label>Chemin du fichier <input type="text" name="path" value="${escapeHtml(cfg.path || "data.json")}" placeholder="data.json"></label>
      </div>
      <label>Personal Access Token (fine-grained, permission <b>Contents: Read &amp; Write</b> sur le repo)
        <input type="password" name="token" value="${escapeHtml(cfg.token || "")}" placeholder="github_pat_…">
      </label>
      <p class="hint" style="margin:0">💡 Créez un token ici : <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--accent-2); border-bottom:1px solid currentColor">github.com/settings/personal-access-tokens</a></p>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button class="btn" id="testSync">Tester la connexion</button>
        <button class="btn primary" id="saveSync">Enregistrer les réglages</button>
      </div>
    </div>

    <h3 style="margin-top:32px">Mot de passe admin</h3>
    <p class="hint">Changez le mot de passe par défaut. Le hash sera stocké dans data.json.</p>
    <div class="admin-form">
      <label>Nouveau mot de passe <input type="password" name="newPwd" autocomplete="new-password"></label>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button class="btn primary" id="changePwd">Changer le mot de passe</button>
      </div>
    </div>

    <h3 style="margin-top:32px">Zone de danger</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <button class="btn" id="importJson">Importer JSON</button>
      <input type="file" id="importFile" accept=".json" style="display:none">
    </div>
  `;
}

function bindSyncForm() {
  $("#saveSync").addEventListener("click", () => {
    const cfg = {
      owner:  $("#adminBody [name='owner']").value.trim(),
      repo:   $("#adminBody [name='repo']").value.trim(),
      branch: $("#adminBody [name='branch']").value.trim() || "main",
      path:   $("#adminBody [name='path']").value.trim() || "data.json",
      token:  $("#adminBody [name='token']").value.trim(),
    };
    localStorage.setItem("ghConfig", JSON.stringify(cfg));
    toast("Réglages enregistrés (localement)");
  });

  $("#testSync").addEventListener("click", async () => {
    const cfg = readGhConfig();
    if (!cfg) return;
    setStatus("saving", "test…");
    try {
      const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
        headers: { "Authorization": `Bearer ${cfg.token}`, "Accept": "application/vnd.github+json" }
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus("saved", "connexion OK");
      toast("Connexion GitHub réussie ✓");
    } catch (e) {
      setStatus("error", "échec");
      toast(`Échec : ${e.message}`, "error");
    }
  });

  $("#changePwd").addEventListener("click", async () => {
    const pwd = $("#adminBody [name='newPwd']").value;
    if (pwd.length < 4) { toast("4 caractères minimum", "error"); return; }
    DATA.meta = DATA.meta || {};
    DATA.meta.passwordHash = await sha256(pwd);
    markDirty();
    toast("Mot de passe mis à jour (enregistrez sur GitHub pour le rendre permanent)");
  });

  $("#importJson").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.profile) throw new Error("Structure invalide");
        if (confirm("Remplacer toutes les données actuelles ?")) {
          DATA = parsed;
          renderAll(); renderAdminTab(); markDirty();
          toast("Importé");
        }
      } catch (err) {
        toast("JSON invalide", "error");
      }
    };
    reader.readAsText(file);
  });
}

/* ==============================================================
   SYNCHRONISATION GITHUB
   ============================================================== */
function readGhConfig() {
  const cfg = JSON.parse(localStorage.getItem("ghConfig") || "{}");
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    toast("Configurez GitHub dans l'onglet « Synchronisation »", "error");
    return null;
  }
  return cfg;
}

function setStatus(cls, txt) {
  const el = $("#adminStatus");
  if (!el) return;
  el.className = `admin-status ${cls}`;
  el.textContent = txt;
}

function markDirty() { setStatus("", "modifications non sauvegardées"); }

async function saveToGithub() {
  const cfg = readGhConfig();
  if (!cfg) return;

  setStatus("saving", "enregistrement…");
  DATA.meta = DATA.meta || {};
  DATA.meta.lastUpdated = new Date().toISOString().slice(0, 10);
  DATA.meta.version = (DATA.meta.version || 0) + 1;

  const content = JSON.stringify(DATA, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(content)));

  try {
    const getUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
    const getRes = await fetch(getUrl, {
      headers: { "Authorization": `Bearer ${cfg.token}`, "Accept": "application/vnd.github+json" }
    });
    let sha;
    if (getRes.ok) {
      const info = await getRes.json();
      sha = info.sha;
    } else if (getRes.status !== 404) {
      throw new Error(`Lecture : HTTP ${getRes.status}`);
    }

    const putRes = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `portfolio: mise à jour via panneau admin (v${DATA.meta.version})`,
        content: b64,
        branch: cfg.branch,
        ...(sha ? { sha } : {})
      })
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${putRes.status}`);
    }
    ORIGINAL_DATA_HASH = await sha256(JSON.stringify(DATA));
    setStatus("saved", `sauvegardé v${DATA.meta.version}`);
    toast("Enregistré sur GitHub ✓ (le site se mettra à jour dans 1-2 min)");
  } catch (e) {
    setStatus("error", "échec");
    toast(`Erreur : ${e.message}`, "error");
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ==============================================================
   BOOT — point d'entrée pour chaque page
   ============================================================== */
window.addEventListener("resize", () => { if (DATA && $("#skillsGraph")) renderGraph(); });

async function bootApp({ active = null, links } = {}) {
  mountHeader({ active, links });
  mountAdminUI();
  initTheme();
  initAdminAccess();
  initAdminPanel();
  await loadData();
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.__PORTFOLIO_PAGE__ !== false) {
    bootApp(window.__PORTFOLIO_PAGE__ || {});
  }
});
