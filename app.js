/* ==============================================================
   PORTFOLIO — LOGIQUE PRINCIPALE
   ============================================================== */

/* ---------- CONFIG ---------- */
const CONFIG = {
  defaultPassword: "admin",
  dataUrl: "./data.json",
  draftKey: "portfolio:draft",
};

/* Navigation MPA partagée. Chaque page passe { active: "<id>" } à bootApp. */
const DEFAULT_NAV_LINKS = [
  { href: "index.html",        label: "Accueil",                  id: "home" },
  { href: "cursus.html",       label: "Cursus",                   id: "cursus" },
  { href: "experiences.html",  label: "Expériences",              id: "experiences" },
  { href: "formations.html",   label: "Formations",               id: "formations" },
  { href: "mediation.html",    label: "Médiation et Engagements", id: "mediation" },
  { href: "financements.html", label: "Financements",             id: "financements" },
  { href: "travaux.html",      label: "Travaux",                  id: "travaux" },
];

/* ---------- ÉTAT GLOBAL ---------- */
let DATA = null;
let ORIGINAL_DATA_HASH = "";
let isAdmin = false;
let activeSkill = null;
let activeItem = null;
let currentTab = "profile";
let editingEntity = null;
let editingSubItem = null;

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
          <button class="admin-tab" data-tab="formations">Formations</button>
          <button class="admin-tab" data-tab="mediation">Médiation</button>
          <button class="admin-tab" data-tab="financements">Financements</button>
          <button class="admin-tab" data-tab="publications">Travaux</button>
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
   MODAL DÉTAIL D'UNE COMPÉTENCE (pages d'items)
   ============================================================== */
function mountSkillModal() {
  if ($("#skillModal")) return;
  const div = document.createElement("div");
  div.id = "skillModal";
  div.className = "skill-modal";
  div.setAttribute("hidden", "");
  div.innerHTML = `
    <div class="skill-modal-backdrop" data-close></div>
    <div class="skill-modal-box" role="dialog" aria-labelledby="skillModalName" aria-modal="true">
      <button class="skill-modal-close" type="button" data-close aria-label="Fermer">×</button>
      <div class="skill-modal-cat" id="skillModalCat"></div>
      <h2 class="skill-modal-name" id="skillModalName"></h2>
      <div class="skill-modal-level" id="skillModalLevel"></div>
      <div class="skill-modal-desc" id="skillModalDesc"></div>
      <div class="skill-modal-uses" id="skillModalUses"></div>
    </div>`;
  document.body.appendChild(div);
  div.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeSkillModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !div.hasAttribute("hidden")) closeSkillModal();
  });
}

const SKILL_CAT_LABELS = {
  scientific: "Compétence scientifique",
  hard: "Compétence technique",
  soft: "Compétence transversale",
};

function openSkillModal(skillId) {
  const sk = (DATA.skills || []).find(s => s.id === skillId);
  if (!sk) return;
  const modal = $("#skillModal");
  if (!modal) return;

  const catLabel = SKILL_CAT_LABELS[sk.category] || sk.category || "";
  const catColor = skillColor(sk.category);
  $("#skillModalCat").innerHTML = catLabel
    ? `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${catColor}; vertical-align:middle; margin-right:8px"></span>${escapeHtml(catLabel)}`
    : "";
  $("#skillModalName").textContent = sk.name || "";
  $("#skillModalLevel").innerHTML = sk.level ? `Niveau : ${escapeHtml(sk.level)}` : "";
  $("#skillModalLevel").style.display = sk.level ? "inline-block" : "none";
  $("#skillModalDesc").innerHTML = sk.description
    ? `<p>${escapeHtml(sk.description).replace(/\n/g, "<br>")}</p>`
    : `<p class="empty-note" style="margin:0">Pas de description.</p>`;

  const uses = findSkillUses(skillId);
  if (!uses.length) {
    $("#skillModalUses").innerHTML = `<h4>Mobilisée dans</h4><p class="empty-note" style="margin:0">Aucun item ne référence encore cette compétence.</p>`;
  } else {
    $("#skillModalUses").innerHTML = `
      <h4>Mobilisée dans (${uses.length})</h4>
      <ul>
        ${uses.map(u => `
          <li>
            <a href="${escapeHtml(KIND_TO_PAGE[u.kind] || '#')}#${escapeHtml(u.id)}">
              <span class="skill-modal-use-kind" data-link-kind="${escapeHtml(u.kind)}">${escapeHtml(ITEM_KIND_LABELS[u.kind] || u.kind)}</span>
              <span class="skill-modal-use-title">${escapeHtml(u.label)}</span>
            </a>
          </li>
        `).join("")}
      </ul>`;
  }

  modal.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
}

function closeSkillModal() {
  const modal = $("#skillModal");
  if (!modal) return;
  modal.setAttribute("hidden", "");
  document.body.style.overflow = "";
}

/* ==============================================================
   CHARGEMENT DES DONNÉES
   ============================================================== */
async function loadData() {
  let usedDraft = false;
  const draft = readDraft();
  if (draft) {
    DATA = draft;
    usedDraft = true;
  } else {
    try {
      const res = await fetch(CONFIG.dataUrl + "?t=" + Date.now());
      if (!res.ok) throw new Error("fetch failed");
      DATA = await res.json();
    } catch (e) {
      console.warn("Impossible de charger data.json, utilisation des données par défaut.", e);
      DATA = getDefaultData();
    }
  }
  ORIGINAL_DATA_HASH = await sha256(JSON.stringify(DATA));
  renderAll();
  if (usedDraft) setStatus("", "brouillon local restauré");
}

function readDraft() {
  try {
    const raw = localStorage.getItem(CONFIG.draftKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.profile) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeDraft() {
  try { localStorage.setItem(CONFIG.draftKey, JSON.stringify(DATA)); }
  catch (e) { console.warn("Impossible d'enregistrer le brouillon local", e); }
}

function clearDraft() {
  try { localStorage.removeItem(CONFIG.draftKey); } catch (e) {}
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
function scrollToHashIfAny() {
  const hash = location.hash;
  if (!hash || hash === "#admin") return;
  const id = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(id);
  if (!target) return;
  setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("hash-flash");
    setTimeout(() => target.classList.remove("hash-flash"), 2400);
  }, 120);
}

function renderAll() {
  renderProfile();
  if ($("#aboutText"))      renderAbout();
  if ($("#skillsGrid"))     renderSkills();
  if ($("#skillsGraph"))    renderGraph();
  if ($("#experienceList") || $("#educationList")) renderTimeline();
  if ($("#pubsList"))       renderPublications();
  if ($("#contactBig"))     renderContact();
  if ($("#cursusList"))         renderCursusPage();
  if ($("#experiencesList"))    renderExperiencesPage();
  if ($("#formationsList"))     renderFormationsPage();
  if ($("#mediationCollective") || $("#mediationGrandPublic")) renderMediationPage();
  if ($("#financementsList"))   renderFinancementsPage();
  if ($("#travauxList"))        renderTravauxPage();
  if ($("#pageCards"))          renderPageCards();
  if ($("#identityCard"))       renderIdentityCard();
  setTimeout(revealOnScroll, 100);
  scrollToHashIfAny();
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
    scientific: { title: "Scientifiques",  idx: "01", skills: [] },
    soft:       { title: "Transversales",  idx: "02", skills: [] },
    hard:       { title: "Techniques",     idx: "03", skills: [] },
  };
  (DATA.skills || []).forEach(s => {
    if (s.category === "language") return;
    (groups[s.category] || groups.hard).skills.push(s);
  });

  grid.innerHTML = Object.entries(groups)
    .filter(([_, g]) => g.skills.length)
    .map(([cat, g]) => `
      <div class="skill-card" data-cat="${cat}">
        <h3>${g.title}<span class="idx">${g.idx}</span></h3>
        <ul>
          ${g.skills.map(s => `
            <li data-skill-id="${s.id}" tabindex="0">
              <div class="skill-line">
                <span class="skill-name">${escapeHtml(s.name)}</span>
                <span class="level">${escapeHtml(s.level || "")}</span>
              </div>
              ${s.description ? `<div class="skill-desc">${escapeHtml(s.description)}</div>` : ""}
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

  const relatedItems = getAllItems()
    .filter(it => aggregatedItemSkills(it).includes(skillId))
    .map(x => x.id);

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

  const item = getAllItems().find(x => x.id === itemId);
  if (!item) return;

  const skills = aggregatedItemSkills(item);
  applyHighlight({ skillIds: skills, itemIds: [itemId] });
  toast(`${item.title || item.role || item.degree || ""} — ${skills.length} compétence(s)`);
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
   PAGES MPA — RENDU
   ============================================================== */

/* Helpers communs : ligne de skills + détail repliable */
function renderSkillChips(ids = []) {
  if (!ids.length) return "";
  const chips = ids.map(sid => {
    const sk = (DATA.skills || []).find(s => s.id === sid);
    if (!sk || sk.category === "language") return "";
    return `<button type="button" class="chip skill-chip" data-skill-id="${escapeHtml(sid)}">${escapeHtml(sk.name)}</button>`;
  }).filter(Boolean);
  if (!chips.length) return "";
  return `<div class="tl-skills">${chips.join("")}</div>`;
}

function periodLabel(start, end) {
  if (!start && !end) return "";
  if (!end) return `Depuis ${fmtDate(start)}`;
  if (start === end) return fmtDate(start);
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}

/* Rendu d'un sous-item (exp / cursus) avec détail repliable */
function renderSubItem(si) {
  const hasDetail = !!(si.detail || (si.skills || []).length);
  return `
    <article class="subitem">
      <div class="subitem-head">
        <div class="subitem-date">${escapeHtml(periodLabel(si.start, si.end))}</div>
        <h4 class="subitem-title">${escapeHtml(si.title || "")}</h4>
        ${si.location ? `<div class="subitem-location">📍 ${escapeHtml(si.location)}</div>` : ""}
        ${si.summary ? `<p class="subitem-summary">${escapeHtml(si.summary)}</p>` : ""}
      </div>
      ${hasDetail ? `
        <button class="subitem-toggle" type="button" data-detail="${escapeHtml(si.id)}">↓ Détails</button>
        <div class="subitem-detail" data-subitem-detail="${escapeHtml(si.id)}" hidden>
          ${si.detail ? `<p>${escapeHtml(si.detail).replace(/\n/g, "<br>")}</p>` : ""}
          ${renderSkillChips(si.skills)}
        </div>
      ` : ""}
    </article>`;
}

function renderLinkedItems(ids = []) {
  if (!ids.length) return "";
  const links = ids.map(id => findLinkedItem(id)).filter(x => x);
  if (!links.length) return "";
  return `
    <div class="entry-links">
      <div class="entry-links-label">↳ Items liés (${links.length})</div>
      <div class="entry-links-list">
        ${links.map(({ item, kind }) => {
          const url = KIND_TO_PAGE[kind] || "#";
          const label = item.title || item.name || "(sans titre)";
          return `
            <a class="entry-link-card" href="${escapeHtml(url)}#${escapeHtml(item.id)}" data-link-kind="${escapeHtml(kind)}">
              <span class="entry-link-kind">${escapeHtml(ITEM_KIND_LABELS[kind] || kind)}</span>
              <span class="entry-link-title">${escapeHtml(label)}</span>
              <span class="entry-link-arrow">→</span>
            </a>`;
        }).join("")}
      </div>
    </div>`;
}

/* Rendu d'une entrée principale avec sous-items dépliables */
function renderEntryWithSubItems(item) {
  const name = item.title || item.role || item.degree || "";
  const subItems = item.subItems || [];
  const linkedItems = item.linkedItems || [];
  return `
    <article class="entry" id="${escapeHtml(item.id)}" data-item-id="${escapeHtml(item.id)}">
      <header class="entry-head">
        <div class="entry-date">${escapeHtml(periodLabel(item.start, item.end))}</div>
        <h2 class="entry-title">${escapeHtml(name)}</h2>
        ${item.org ? `<div class="entry-org">${escapeHtml(item.org)}</div>` : ""}
        ${item.location ? `<div class="entry-location">📍 ${escapeHtml(item.location)}</div>` : ""}
        ${item.description ? `<p class="entry-desc">${escapeHtml(item.description)}</p>` : ""}
        ${renderSkillChips(item.skills)}
      </header>
      ${subItems.length ? `
        <button class="entry-toggle" type="button" data-expand="${escapeHtml(item.id)}" data-count="${subItems.length}">
          ↓ ${subItems.length > 1 ? `Voir les ${subItems.length} sous-expériences` : "Voir la sous-expérience"}
        </button>
        <div class="entry-subitems" data-subitems="${escapeHtml(item.id)}" hidden>
          ${subItems.map(renderSubItem).join("")}
        </div>
      ` : ""}
      ${renderLinkedItems(linkedItems)}
    </article>`;
}

function bindEntryToggles(root) {
  root.querySelectorAll("[data-expand]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.expand;
      const target = root.querySelector(`[data-subitems="${CSS.escape(id)}"]`);
      if (!target) return;
      const wasHidden = target.hasAttribute("hidden");
      const n = parseInt(btn.dataset.count, 10) || 0;
      if (wasHidden) {
        target.removeAttribute("hidden");
        btn.textContent = n > 1 ? `↑ Masquer les sous-expériences` : `↑ Masquer la sous-expérience`;
      } else {
        target.setAttribute("hidden", "");
        btn.textContent = n > 1 ? `↓ Voir les ${n} sous-expériences` : `↓ Voir la sous-expérience`;
      }
    });
  });
  root.querySelectorAll("[data-detail]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.detail;
      const target = root.querySelector(`[data-subitem-detail="${CSS.escape(id)}"]`);
      if (!target) return;
      const wasHidden = target.hasAttribute("hidden");
      if (wasHidden) {
        target.removeAttribute("hidden");
        btn.textContent = "↑ Masquer";
      } else {
        target.setAttribute("hidden", "");
        btn.textContent = "↓ Détails";
      }
    });
  });
}

function renderItemListWithSubItems(key, container) {
  const items = (DATA[key] || []).slice().sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  if (!items.length) {
    container.innerHTML = `<div class="empty-note">Rien à afficher pour le moment.</div>`;
    return;
  }
  container.innerHTML = items.map(renderEntryWithSubItems).join("");
  bindEntryToggles(container);
}

function renderCursusPage() {
  renderItemListWithSubItems("cursus", $("#cursusList"));
}

function renderExperiencesPage() {
  renderItemListWithSubItems("experiences", $("#experiencesList"));
}

/* Rendu simple d'une entrée plate (formations, financements, rayonnement) */
function renderFlatEntry(it, dateField = "start") {
  const dateStr = dateField === "year"
    ? escapeHtml(String(it.year || ""))
    : escapeHtml(periodLabel(it.start, it.end));
  return `
    <article class="entry" id="${escapeHtml(it.id)}">
      ${dateStr ? `<div class="entry-date">${dateStr}</div>` : ""}
      <h3 class="entry-title">${escapeHtml(it.title || "")}</h3>
      ${it.org ? `<div class="entry-org">${escapeHtml(it.org)}</div>` : ""}
      ${it.location ? `<div class="entry-location">📍 ${escapeHtml(it.location)}</div>` : ""}
      ${it.amount ? `<div class="entry-amount">💶 ${escapeHtml(it.amount)}</div>` : ""}
      ${it.description ? `<p class="entry-desc">${escapeHtml(it.description)}</p>` : ""}
      ${renderSkillChips(it.skills)}
    </article>`;
}

function renderFormationsPage() {
  const container = $("#formationsList");
  const items = (DATA.formations || []).slice().sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  container.innerHTML = items.length
    ? items.map(it => renderFlatEntry(it, "start")).join("")
    : `<div class="empty-note">Aucune formation à afficher.</div>`;
}

function renderMediationPage() {
  const items = DATA.rayonnement || [];
  const collective  = items.filter(it => it.category === "collective")
                           .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const grandpublic = items.filter(it => it.category === "grandpublic")
                           .sort((a, b) => (b.start || "").localeCompare(a.start || ""));

  if ($("#mediationCollective")) {
    $("#mediationCollective").innerHTML = collective.length
      ? collective.map(it => renderFlatEntry(it, "start")).join("")
      : `<div class="empty-note">Aucune implication collective à afficher.</div>`;
  }
  if ($("#mediationGrandPublic")) {
    $("#mediationGrandPublic").innerHTML = grandpublic.length
      ? grandpublic.map(it => renderFlatEntry(it, "start")).join("")
      : `<div class="empty-note">Aucune action grand public à afficher.</div>`;
  }
}

function renderFinancementsPage() {
  const container = $("#financementsList");
  const items = (DATA.financements || []).slice()
    .sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
  container.innerHTML = items.length
    ? items.map(it => renderFlatEntry(it, "year")).join("")
    : `<div class="empty-note">Aucun financement à afficher.</div>`;
}

function renderTravauxPage() {
  const container = $("#travauxList");
  const pubs = (DATA.publications || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  if (!pubs.length) {
    container.innerHTML = `<div class="empty-note">Pas encore de publication.</div>`;
    return;
  }
  const typeLabels = {
    article: "Article",
    abstract: "Abstract",
    communication: "Communication",
    preprint: "Preprint",
  };
  container.innerHTML = pubs.map(p => {
    const hasAbstract = !!(p.abstract && p.abstract.trim());
    return `
      <article class="travaux-item" id="${escapeHtml(p.id)}" data-item-id="${escapeHtml(p.id)}">
        <div class="travaux-meta">
          <span class="travaux-year">${escapeHtml(String(p.year || ""))}</span>
          ${p.type ? `<span class="travaux-type">${escapeHtml(typeLabels[p.type] || p.type)}</span>` : ""}
        </div>
        <h2 class="travaux-title">${escapeHtml(p.title || "")}</h2>
        ${p.authors ? `<div class="travaux-authors">${escapeHtml(p.authors)}</div>` : ""}
        ${p.venue ? `<div class="travaux-venue">${escapeHtml(p.venue)}</div>` : ""}
        ${hasAbstract ? `
          <button class="subitem-toggle" type="button" data-detail="abs-${escapeHtml(p.id)}">↓ Lire l'abstract</button>
          <div class="subitem-detail" data-subitem-detail="abs-${escapeHtml(p.id)}" hidden>
            <p>${escapeHtml(p.abstract).replace(/\n/g, "<br>")}</p>
          </div>
        ` : ""}
        ${renderSkillChips(p.skills)}
        ${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="travaux-link">Lire ↗</a>` : ""}
      </article>`;
  }).join("");
  bindEntryToggles(container);
}

/* Page d'accueil — cartes vers les autres pages */
function renderPageCards() {
  const container = $("#pageCards");
  const cards = [
    { href: "cursus.html",       label: "Cursus",                   desc: "Parcours universitaire — diplômes obtenus.",                count: (DATA.cursus       || []).length },
    { href: "experiences.html",  label: "Expériences",              desc: "Postes de recherche, stages, expériences professionnelles.", count: (DATA.experiences  || []).length },
    { href: "formations.html",   label: "Formations",               desc: "Formations courtes, certifications, écoles thématiques.",    count: (DATA.formations   || []).length },
    { href: "mediation.html",    label: "Médiation et Engagements", desc: "Implications collectives et actions grand public.",          count: (DATA.rayonnement  || []).length },
    { href: "financements.html", label: "Financements",             desc: "Bourses, prix, appels à projets obtenus.",                   count: (DATA.financements || []).length },
    { href: "travaux.html",      label: "Travaux",                  desc: "Publications, abstracts, communications.",                   count: (DATA.publications || []).length },
  ];
  container.innerHTML = cards.map((c, i) => `
    <a class="page-card" href="${escapeHtml(c.href)}">
      <div class="page-card-idx">${String(i + 1).padStart(2, "0")}</div>
      <div class="page-card-body">
        <h3>${escapeHtml(c.label)}</h3>
        <p>${escapeHtml(c.desc)}</p>
      </div>
      <div class="page-card-count">${c.count}</div>
    </a>
  `).join("");
}

/* Carte d'identité (homepage) */
function renderIdentityCard() {
  const container = $("#identityCard");
  const p = DATA.profile || {};
  const facts = [
    ["Nom", p.name],
    ["Poste", p.title],
    ["Laboratoire", p.lab],
    ["Lieu", p.location],
    ["Email", p.email ? `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : ""],
    p.orcid ? ["ORCID", `<a href="${escapeHtml(p.links?.orcid || '#')}" target="_blank" rel="noopener">${escapeHtml(p.orcid)}</a>`] : null,
    p.links?.linkedin ? ["LinkedIn", `<a href="${escapeHtml(p.links.linkedin)}" target="_blank" rel="noopener">Profil LinkedIn ↗</a>`] : null,
  ].filter(Boolean).filter(([_, v]) => v);

  container.innerHTML = `
    <dl class="facts">
      ${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}
    </dl>
  `;
}

/* ==============================================================
   GRAPHE D3 — RÉSEAU DE COMPÉTENCES
   ============================================================== */
let graphApi = null;

const SKILL_COLORS = {
  scientific: "#87b88c",
  soft:       "#c4a8de",
  hard:       "#7fb3d9",
};

const ITEM_KIND_COLORS = {
  cursus:      "#5b8fb9",
  experience:  "#d4894e",
  formation:   "#6fa86f",
  rayonnement: "#c47a9c",
  financement: "#c2a04a",
  publication: "#8a72b8",
};

const ITEM_KIND_LABELS = {
  cursus:      "Cursus",
  experience:  "Expérience",
  formation:   "Formation",
  rayonnement: "Médiation",
  financement: "Financement",
  publication: "Travail",
};

function skillColor(category) {
  return SKILL_COLORS[category] || SKILL_COLORS.hard;
}

function itemColor(kind) {
  return ITEM_KIND_COLORS[kind] || "var(--ink)";
}

function rectCollide() {
  let nodes;
  function force(alpha) {
    const iterations = 2;
    const len = nodes.length;
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < len; i++) {
        const a = nodes[i];
        const aCx = a.x + (a._anchorX || 0);
        for (let j = i + 1; j < len; j++) {
          const b = nodes[j];
          const bCx = b.x + (b._anchorX || 0);
          const dx = bCx - aCx;
          const dy = b.y - a.y;
          const overlapX = (a._halfW + b._halfW) - Math.abs(dx);
          const overlapY = (a._halfH + b._halfH) - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = (overlapX / 2) * (dx < 0 ? -1 : 1) * alpha;
              a.x -= push;
              b.x += push;
            } else {
              const push = (overlapY / 2) * (dy < 0 ? -1 : 1) * alpha;
              a.y -= push;
              b.y += push;
            }
          }
        }
      }
    }
  }
  force.initialize = (n) => { nodes = n; };
  return force;
}

function aggregatedItemSkills(item) {
  const set = new Set(item.skills || []);
  (item.subItems || []).forEach(si => (si.skills || []).forEach(sid => set.add(sid)));
  return [...set];
}

const COLLECTION_TO_KIND = {
  cursus: "cursus",
  experiences: "experience",
  formations: "formation",
  rayonnement: "rayonnement",
  financements: "financement",
  publications: "publication",
};

const KIND_TO_PAGE = {
  cursus: "cursus.html",
  experience: "experiences.html",
  formation: "formations.html",
  rayonnement: "mediation.html",
  financement: "financements.html",
  publication: "travaux.html",
};

function findLinkedItem(id) {
  for (const coll of Object.keys(COLLECTION_TO_KIND)) {
    const item = (DATA[coll] || []).find(x => x.id === id);
    if (item) return { item, kind: COLLECTION_TO_KIND[coll], collection: coll };
  }
  return null;
}

function findSkillUses(skillId) {
  const uses = [];
  for (const coll of Object.keys(COLLECTION_TO_KIND)) {
    (DATA[coll] || []).forEach(it => {
      const direct = (it.skills || []).includes(skillId);
      const viaSub = (it.subItems || []).some(si => (si.skills || []).includes(skillId));
      if (direct || viaSub) {
        uses.push({
          id: it.id,
          kind: COLLECTION_TO_KIND[coll],
          label: it.title || it.name || "(sans titre)",
        });
      }
    });
  }
  return uses;
}

function getAllItems() {
  return [
    ...(DATA.cursus       || []).map(it => ({ ...it, _kind: "cursus" })),
    ...(DATA.experiences  || []).map(it => ({ ...it, _kind: "experience" })),
    ...(DATA.formations   || []).map(it => ({ ...it, _kind: "formation" })),
    ...(DATA.rayonnement  || []).map(it => ({ ...it, _kind: "rayonnement" })),
    ...(DATA.financements || []).map(it => ({ ...it, _kind: "financement" })),
    ...(DATA.publications || []).map(it => ({ ...it, _kind: "publication" })),
  ];
}

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

  const graphSkills = (DATA.skills || []).filter(s => s.category !== "language");
  const skillIds = new Set(graphSkills.map(s => s.id));
  const skillNodes = graphSkills.map(s => ({
    id: s.id, label: s.name, type: "skill", category: s.category
  }));

  const itemNodes = [];
  const links = [];
  const addItem = (item, kind) => {
    if (!item || !item.id) return;
    itemNodes.push({
      id: item.id,
      label: item.title || item.name || "?",
      type: "item",
      kind,
    });
    aggregatedItemSkills(item).forEach(sid => {
      if (skillIds.has(sid)) links.push({ source: item.id, target: sid });
    });
  };
  (DATA.cursus       || []).forEach(it => addItem(it, "cursus"));
  (DATA.experiences  || []).forEach(it => addItem(it, "experience"));
  (DATA.formations   || []).forEach(it => addItem(it, "formation"));
  (DATA.rayonnement  || []).forEach(it => addItem(it, "rayonnement"));
  (DATA.financements || []).forEach(it => addItem(it, "financement"));
  (DATA.publications || []).forEach(it => addItem(it, "publication"));

  const nodes = [...skillNodes, ...itemNodes];

  if (!nodes.length) {
    g.append("text").attr("x", w/2).attr("y", h/2).attr("text-anchor", "middle")
      .attr("fill", "var(--muted)").attr("font-family", "Fraunces, serif").attr("font-style", "italic")
      .text("Ajoutez des compétences et expériences pour voir le graphe.");
    return;
  }

  const radiusFor = (n) => n.type === "item" ? 11 : 9;
  const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

  nodes.forEach(n => { n._label = truncate(n.label || "", 26); });

  const sim = d3.forceSimulation(nodes)
    .force("link",   d3.forceLink(links).id(d => d.id).distance(110).strength(.35))
    .force("charge", d3.forceManyBody().strength(-380))
    .force("center", d3.forceCenter(w/2, h/2))
    .force("x",      d3.forceX(w/2).strength(.04))
    .force("y",      d3.forceY(h/2).strength(.04));

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

  const ITEM_SIDE = 18;
  node.each(function(d) {
    const sel = d3.select(this);
    if (d.type === "skill") {
      sel.append("circle")
        .attr("class", "node-shape")
        .attr("r", radiusFor(d))
        .attr("fill", skillColor(d.category))
        .attr("stroke", "var(--line)")
        .attr("stroke-width", 1);
    } else {
      sel.append("rect")
        .attr("class", "node-shape")
        .attr("x", -ITEM_SIDE / 2)
        .attr("y", -ITEM_SIDE / 2)
        .attr("width", ITEM_SIDE)
        .attr("height", ITEM_SIDE)
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("fill", "var(--bg-elev)")
        .attr("stroke", itemColor(d.kind))
        .attr("stroke-width", 2);
    }
  });

  node.append("text")
    .attr("dx", d => radiusFor(d) + 6)
    .attr("dy", 4)
    .text(d => d._label);

  // Mesure de la bbox (taille texte + nœud) pour la collision rectangulaire
  node.each(function(d) {
    const txt = this.querySelector("text");
    let tw = 0, th = 12;
    if (txt) {
      try { const b = txt.getBBox(); tw = b.width; th = b.height; }
      catch (e) { tw = (d._label || "").length * 6.2; }
    }
    const r = radiusFor(d);
    d._anchorX = 3 + tw / 2;
    d._halfW = r + 3 + tw / 2 + 4;
    d._halfH = Math.max(r, th / 2 + 4) + 3;
  });

  sim.force("collide", rectCollide());

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

  sim.alpha(0.9).restart();

  graphApi = {
    highlight({ skillIds, itemIds, hasSelection }) {
      const sel = new Set([...skillIds, ...itemIds]);
      node.classed("dim", d => hasSelection && !sel.has(d.id))
          .classed("highlighted", d => sel.has(d.id));
      link.classed("dim", l => hasSelection && !sel.has(l.source.id) && !sel.has(l.target.id))
          .classed("highlighted", l => sel.has(l.source.id) && sel.has(l.target.id));
      node.select(".node-shape")
        .attr("stroke", d => sel.has(d.id) ? "var(--accent)" : (d.type === "skill" ? "var(--line)" : itemColor(d.kind)))
        .attr("stroke-width", d => sel.has(d.id) ? 3 : (d.type === "skill" ? 1 : 2));
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
    case "formations":   body.innerHTML = renderEntityList("formations", "Formation");   bindEntityList("formations"); break;
    case "mediation":    body.innerHTML = renderEntityList("rayonnement", "Action");     bindEntityList("rayonnement"); break;
    case "financements": body.innerHTML = renderEntityList("financements", "Financement"); bindEntityList("financements"); break;
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
    if (key === "experiences")  return { t: it.title || it.role   || "(sans titre)", s: `${it.org || ""} — ${fmtDate(it.start)}${(it.subItems||[]).length ? ` · ${(it.subItems||[]).length} sous-exp.` : ""}` };
    if (key === "cursus")       return { t: it.title || it.degree || "(sans titre)", s: `${it.org || ""} — ${fmtDate(it.start)}${(it.subItems||[]).length ? ` · ${(it.subItems||[]).length} sous-exp.` : ""}` };
    if (key === "formations")   return { t: it.title || "(sans titre)", s: `${it.org || ""} — ${fmtDate(it.start)}` };
    if (key === "rayonnement")  return { t: it.title || "(sans titre)", s: `${it.category === "collective" ? "Collectif scientifique" : "Grand public"} — ${fmtDate(it.start)}` };
    if (key === "financements") return { t: it.title || "(sans titre)", s: `${it.org || ""}${it.year ? " — " + it.year : ""}${it.amount ? " — " + it.amount : ""}` };
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
              <option value="scientific" ${it.category==="scientific"?"selected":""}>Scientifique</option>
              <option value="soft"       ${it.category==="soft"      ?"selected":""}>Transversale</option>
              <option value="hard"       ${it.category==="hard"      ?"selected":""}>Technique</option>
            </select>
          </label>
          <label>Niveau <input type="text" name="level" value="${escapeHtml(it.level)}" placeholder="ex. avancé, C1…"></label>
        </div>
        <label>Description (optionnel — affichée au survol / clic) <textarea name="description" rows="3">${escapeHtml(it.description)}</textarea></label>
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
        <label>Compétences liées (agrégées sur l'item principal)
          <div class="checkbox-grid">${skillOptions || "<span style='color:var(--muted); font-size:.8rem'>Ajoutez d'abord des compétences.</span>"}</div>
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end">
          ${item ? `<button class="btn" id="cancelEdit">Annuler</button>` : ""}
          <button class="btn primary" id="saveEntity">${item ? "Mettre à jour" : "Ajouter"}</button>
        </div>
      </div>
      ${item ? renderSubItemsAdmin(key, item) : `<p class="hint" style="margin-top:16px">💡 Enregistrez d'abord cette entrée pour pouvoir y ajouter des sous-expériences.</p>`}
      ${item ? renderLinksAdmin(key, item) : ""}
    `;
  }

  if (key === "formations") {
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier la formation" : "Nouvelle formation"}</h3>
        <label>Titre <input type="text" name="title" value="${escapeHtml(it.title)}" required></label>
        <label>Organisme <input type="text" name="org" value="${escapeHtml(it.org)}"></label>
        <div class="row">
          <label>Début (AAAA-MM) <input type="text" name="start" value="${escapeHtml(it.start)}" placeholder="2024-06"></label>
          <label>Fin (AAAA-MM) <input type="text" name="end" value="${escapeHtml(it.end)}" placeholder="2024-06"></label>
        </div>
        <label>Lieu <input type="text" name="location" value="${escapeHtml(it.location)}" placeholder="ou « En ligne »"></label>
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

  if (key === "rayonnement") {
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier l'action" : "Nouvelle action"}</h3>
        <label>Catégorie
          <select name="category">
            <option value="collective"  ${it.category==="collective"  ? "selected" : ""}>Implication collective scientifique</option>
            <option value="grandpublic" ${it.category==="grandpublic" ? "selected" : ""}>Action grand public / Médiation</option>
          </select>
        </label>
        <label>Titre / Rôle <input type="text" name="title" value="${escapeHtml(it.title)}" required></label>
        <label>Structure ou événement <input type="text" name="org" value="${escapeHtml(it.org)}"></label>
        <div class="row">
          <label>Début (AAAA-MM) <input type="text" name="start" value="${escapeHtml(it.start)}"></label>
          <label>Fin (AAAA-MM, vide = en cours) <input type="text" name="end" value="${escapeHtml(it.end)}"></label>
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

  if (key === "financements") {
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier le financement" : "Nouveau financement"}</h3>
        <label>Titre / Nom (bourse, prix, appel à projet) <input type="text" name="title" value="${escapeHtml(it.title)}" required></label>
        <label>Organisme financeur <input type="text" name="org" value="${escapeHtml(it.org)}"></label>
        <div class="row">
          <label>Année <input type="number" name="year" value="${escapeHtml(it.year)}" min="1900" max="2100"></label>
          <label>Montant (optionnel) <input type="text" name="amount" value="${escapeHtml(it.amount)}" placeholder="3 000 €"></label>
        </div>
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
    const t = it.type || "article";
    return `
      <div class="admin-form">
        <h3>${item ? "Modifier la publication" : "Nouvelle publication"}</h3>
        <label>Titre <input type="text" name="title" value="${escapeHtml(it.title)}" required></label>
        <div class="row">
          <label>Année <input type="number" name="year" value="${escapeHtml(it.year)}" min="1900" max="2100"></label>
          <label>Type
            <select name="type">
              <option value="article"        ${t==="article"      ?"selected":""}>Article</option>
              <option value="abstract"       ${t==="abstract"     ?"selected":""}>Abstract</option>
              <option value="communication"  ${t==="communication"?"selected":""}>Communication</option>
              <option value="preprint"       ${t==="preprint"     ?"selected":""}>Preprint</option>
            </select>
          </label>
        </div>
        <label>Revue / Conférence (Venue) <input type="text" name="venue" value="${escapeHtml(it.venue)}"></label>
        <label>Auteurs <input type="text" name="authors" value="${escapeHtml(it.authors)}" placeholder="Nom P., Co-auteur A."></label>
        <label>URL (DOI, PDF…) <input type="url" name="url" value="${escapeHtml(it.url)}"></label>
        <label>Abstract / Résumé <textarea name="abstract" rows="6">${escapeHtml(it.abstract)}</textarea></label>
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

/* ---------- Sous-items (cursus / experiences) ---------- */
function renderSubItemsAdmin(parentKey, parent) {
  const subItems = parent.subItems || [];
  return `
    <div class="subitems-admin" style="margin-top:24px; padding-top:20px; border-top:1px dashed var(--line)">
      <h3>Sous-expériences <span style="color:var(--muted); font-weight:400">(${subItems.length})</span></h3>
      <p class="hint">Détaillez les activités, missions ou stages réalisés au sein de cette entrée principale.</p>
      ${subItems.length ? `
        <div class="admin-list">
          ${subItems.map(si => `
            <div class="admin-item" data-subid="${escapeHtml(si.id)}">
              <div class="admin-item-info">
                <div class="t">${escapeHtml(si.title || "(sans titre)")}</div>
                <div class="s">${escapeHtml(periodLabel(si.start, si.end))}${si.location ? " · " + escapeHtml(si.location) : ""}</div>
              </div>
              <div class="actions">
                <button class="btn small" data-act="edit-sub">Éditer</button>
                <button class="btn small danger" data-act="delete-sub">✕</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-note">Aucune sous-expérience pour le moment.</div>`}
      <div style="display:flex; gap:8px; margin-top:12px">
        <button class="btn primary" id="addSubItem">+ Ajouter une sous-expérience</button>
      </div>
      <div id="subItemForm"></div>
    </div>
  `;
}

function renderSubItemForm(subItem) {
  const si = subItem || {};
  const skillOptions = (DATA.skills || []).map(s =>
    `<label><input type="checkbox" name="sub-skill" value="${s.id}" ${(si.skills||[]).includes(s.id) ? "checked" : ""}> ${escapeHtml(s.name)}</label>`
  ).join("");
  return `
    <div class="admin-form" style="margin-top:16px">
      <h3>${subItem ? "Modifier la sous-expérience" : "Nouvelle sous-expérience"}</h3>
      <label>Titre <input type="text" name="sub-title" value="${escapeHtml(si.title)}" required></label>
      <label>Lieu <input type="text" name="sub-location" value="${escapeHtml(si.location)}"></label>
      <div class="row">
        <label>Début (AAAA-MM) <input type="text" name="sub-start" value="${escapeHtml(si.start)}"></label>
        <label>Fin (AAAA-MM, vide = en cours) <input type="text" name="sub-end" value="${escapeHtml(si.end)}"></label>
      </div>
      <label>Résumé court (2–3 phrases, affiché dans la liste) <textarea name="sub-summary" rows="2">${escapeHtml(si.summary)}</textarea></label>
      <label>Détail (affiché au clic, peut être long) <textarea name="sub-detail" rows="6">${escapeHtml(si.detail)}</textarea></label>
      <label>Compétences mobilisées
        <div class="checkbox-grid">${skillOptions || "<span style='color:var(--muted); font-size:.8rem'>Ajoutez d'abord des compétences.</span>"}</div>
      </label>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button class="btn" id="cancelSubItem">Annuler</button>
        <button class="btn primary" id="saveSubItem">${subItem ? "Mettre à jour" : "Ajouter"}</button>
      </div>
    </div>
  `;
}

function bindSubItemsAdmin(parentKey, parent) {
  $$(".subitems-admin .admin-item").forEach(el => {
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      const subId = el.dataset.subid;
      const sub = (parent.subItems || []).find(s => s.id === subId);
      if (!sub) return;
      if (btn?.dataset.act === "delete-sub") {
        if (confirm("Supprimer cette sous-expérience ?")) {
          parent.subItems = (parent.subItems || []).filter(s => s.id !== subId);
          editingSubItem = null;
          markDirty();
          renderAll();
          $("#entityForm").innerHTML = renderEntityForm(parentKey, parent);
          bindEntityForm(parentKey);
          toast("Sous-expérience supprimée");
        }
      } else if (btn?.dataset.act === "edit-sub") {
        editingSubItem = sub;
        $("#subItemForm").innerHTML = renderSubItemForm(sub);
        bindSubItemForm(parentKey, parent);
        $("#subItemForm").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  $("#addSubItem")?.addEventListener("click", () => {
    editingSubItem = null;
    $("#subItemForm").innerHTML = renderSubItemForm(null);
    bindSubItemForm(parentKey, parent);
    $("#subItemForm").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindSubItemForm(parentKey, parent) {
  $("#cancelSubItem")?.addEventListener("click", () => {
    editingSubItem = null;
    $("#subItemForm").innerHTML = "";
  });

  $("#saveSubItem")?.addEventListener("click", () => {
    const f = $("#subItemForm");
    const obj = editingSubItem ? { ...editingSubItem } : { id: uid("sub") };
    obj.title    = f.querySelector('[name="sub-title"]').value.trim();
    obj.location = f.querySelector('[name="sub-location"]').value.trim();
    obj.start    = f.querySelector('[name="sub-start"]').value.trim();
    obj.end      = f.querySelector('[name="sub-end"]').value.trim() || null;
    obj.summary  = f.querySelector('[name="sub-summary"]').value.trim();
    obj.detail   = f.querySelector('[name="sub-detail"]').value.trim();
    obj.skills   = [...f.querySelectorAll('input[name="sub-skill"]:checked')].map(x => x.value);
    if (!obj.title) { toast("Titre requis", "error"); return; }

    parent.subItems = parent.subItems || [];
    if (editingSubItem) {
      const idx = parent.subItems.findIndex(s => s.id === editingSubItem.id);
      parent.subItems[idx] = obj;
    } else {
      parent.subItems.push(obj);
    }
    editingSubItem = null;
    markDirty();
    renderAll();
    $("#entityForm").innerHTML = renderEntityForm(parentKey, parent);
    bindEntityForm(parentKey);
    toast("Sous-expérience enregistrée localement");
  });
}

function bindEntityForm(key) {
  const form = $("#entityForm");
  if (!form) return;

  $("#cancelEdit")?.addEventListener("click", () => {
    editingEntity = null;
    editingSubItem = null;
    $("#entityForm").innerHTML = "";
  });

  $("#saveEntity")?.addEventListener("click", () => {
    const idPrefix = key === "rayonnement" ? "ray" : key.slice(0, 3);
    const obj = editingEntity ? { ...editingEntity } : { id: uid(idPrefix) };

    if (key === "skills") {
      obj.name = form.querySelector('[name="name"]').value.trim();
      obj.category = form.querySelector('[name="category"]').value;
      obj.level = form.querySelector('[name="level"]').value.trim();
      obj.description = form.querySelector('[name="description"]').value.trim();
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
      obj.linkedItems = editingEntity?.linkedItems || [];
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }
    if (key === "formations") {
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.org = form.querySelector('[name="org"]').value.trim();
      obj.start = form.querySelector('[name="start"]').value.trim();
      obj.end = form.querySelector('[name="end"]').value.trim() || null;
      obj.location = form.querySelector('[name="location"]').value.trim();
      obj.description = form.querySelector('[name="description"]').value.trim();
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }
    if (key === "rayonnement") {
      obj.category = form.querySelector('[name="category"]').value;
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.org = form.querySelector('[name="org"]').value.trim();
      obj.start = form.querySelector('[name="start"]').value.trim();
      obj.end = form.querySelector('[name="end"]').value.trim() || null;
      obj.location = form.querySelector('[name="location"]').value.trim();
      obj.description = form.querySelector('[name="description"]').value.trim();
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }
    if (key === "financements") {
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.org = form.querySelector('[name="org"]').value.trim();
      obj.year = form.querySelector('[name="year"]').value.trim();
      obj.amount = form.querySelector('[name="amount"]').value.trim();
      obj.description = form.querySelector('[name="description"]').value.trim();
      obj.skills = [...form.querySelectorAll('input[name="skill"]:checked')].map(x => x.value);
      if (!obj.title) { toast("Titre requis", "error"); return; }
    }
    if (key === "publications") {
      obj.title = form.querySelector('[name="title"]').value.trim();
      obj.year = parseInt(form.querySelector('[name="year"]').value) || null;
      obj.type = form.querySelector('[name="type"]').value;
      obj.venue = form.querySelector('[name="venue"]').value.trim();
      obj.authors = form.querySelector('[name="authors"]').value.trim();
      obj.url = form.querySelector('[name="url"]').value.trim();
      obj.abstract = form.querySelector('[name="abstract"]').value.trim();
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
    editingSubItem = null;
    renderAll();
    renderAdminTab();
    markDirty();
    toast(`Enregistré localement — n'oubliez pas de « Enregistrer sur GitHub »`);
  });

  if ((key === "experiences" || key === "cursus") && editingEntity) {
    bindSubItemsAdmin(key, editingEntity);
    bindLinksAdmin(key, editingEntity);
  }
}

/* ---------- Items liés (cursus / experiences) ---------- */
function renderLinksAdmin(parentKey, parent) {
  const linkedIds = parent.linkedItems || [];
  const links = linkedIds.map(id => findLinkedItem(id)).filter(x => x);

  const linkedSet = new Set(linkedIds);
  const candidates = [];
  for (const coll of Object.keys(COLLECTION_TO_KIND)) {
    (DATA[coll] || []).forEach(it => {
      if (it.id === parent.id) return;
      if (linkedSet.has(it.id)) return;
      candidates.push({
        id: it.id,
        kind: COLLECTION_TO_KIND[coll],
        label: it.title || it.name || "(sans titre)",
      });
    });
  }
  candidates.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));

  return `
    <div class="links-admin" style="margin-top:24px; padding-top:20px; border-top:1px dashed var(--line)">
      <h3>Items liés <span style="color:var(--muted); font-weight:400">(${links.length})</span></h3>
      <p class="hint">Reliez d'autres entrées du portfolio pour les afficher en bas de cette entrée. Un clic sur le lien redirige vers la page concernée.</p>
      ${links.length ? `
        <div class="admin-list">
          ${links.map(({ item, kind }) => `
            <div class="admin-item" data-link-id="${escapeHtml(item.id)}">
              <div class="admin-item-info">
                <div class="t">${escapeHtml(item.title || item.name || "(sans titre)")}</div>
                <div class="s">${escapeHtml(ITEM_KIND_LABELS[kind] || kind)}</div>
              </div>
              <div class="actions">
                <button class="btn small danger" data-act="unlink">✕ Délier</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-note">Aucun item lié pour le moment.</div>`}
      <div style="display:flex; gap:8px; margin-top:12px; align-items:center; flex-wrap:wrap">
        <select id="linkPicker" style="flex:1; min-width:220px">
          <option value="">— Sélectionner un item à lier —</option>
          ${candidates.length ? renderLinkOptions(candidates) : `<option value="" disabled>Aucun candidat disponible</option>`}
        </select>
        <button class="btn primary" id="addLink" ${candidates.length ? "" : "disabled"}>+ Lier</button>
      </div>
    </div>
  `;
}

function renderLinkOptions(candidates) {
  const groups = {};
  candidates.forEach(c => {
    const label = ITEM_KIND_LABELS[c.kind] || c.kind;
    (groups[label] = groups[label] || []).push(c);
  });
  return Object.entries(groups).map(([label, items]) => `
    <optgroup label="${escapeHtml(label)}">
      ${items.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join("")}
    </optgroup>
  `).join("");
}

function bindLinksAdmin(parentKey, parent) {
  $$(".links-admin .admin-item").forEach(el => {
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (btn?.dataset.act !== "unlink") return;
      const id = el.dataset.linkId;
      parent.linkedItems = (parent.linkedItems || []).filter(x => x !== id);
      markDirty();
      renderAll();
      $("#entityForm").innerHTML = renderEntityForm(parentKey, parent);
      bindEntityForm(parentKey);
      toast("Lien retiré");
    });
  });

  $("#addLink")?.addEventListener("click", () => {
    const sel = $("#linkPicker");
    const id = sel?.value;
    if (!id) { toast("Sélectionnez un item à lier", "error"); return; }
    parent.linkedItems = parent.linkedItems || [];
    if (!parent.linkedItems.includes(id)) parent.linkedItems.push(id);
    markDirty();
    renderAll();
    $("#entityForm").innerHTML = renderEntityForm(parentKey, parent);
    bindEntityForm(parentKey);
    toast("Item lié");
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

    <h3 style="margin-top:32px">Brouillon local</h3>
    <p class="hint">Toute modification non poussée sur GitHub est conservée dans le navigateur (et restaurée à la navigation entre les pages). Annuler le brouillon recharge le <code>data.json</code> du serveur.</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <button class="btn" id="importJson">Importer JSON</button>
      <button class="btn danger" id="discardDraft">Annuler le brouillon local</button>
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

  $("#discardDraft").addEventListener("click", async () => {
    if (!confirm("Annuler toutes les modifications locales non poussées ?")) return;
    clearDraft();
    await loadData();
    renderAdminTab();
    setStatus("", "brouillon supprimé");
    toast("Brouillon annulé — données rechargées depuis le serveur");
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

function markDirty() {
  writeDraft();
  setStatus("", "brouillon local — non poussé sur GitHub");
}

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
    clearDraft();
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
  mountSkillModal();
  initTheme();
  initAdminAccess();
  initAdminPanel();
  await loadData();
  window.addEventListener("hashchange", scrollToHashIfAny);
  document.body.addEventListener("click", (e) => {
    const chip = e.target.closest(".skill-chip[data-skill-id]");
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    openSkillModal(chip.dataset.skillId);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.__PORTFOLIO_PAGE__ !== false) {
    bootApp(window.__PORTFOLIO_PAGE__ || {});
  }
});
