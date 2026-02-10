function getAuthHeader(){
  const t = localStorage.getItem('token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function fetchJSON(url, opts={}){
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeader());
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // not authenticated
    document.getElementById('loginLink').style.display = 'inline';
    document.getElementById('adminLink').style.display = 'none';
  }
  return res.json();
}

async function loadCandidates(q){
  const url = q ? `/api/candidates/search?q=${encodeURIComponent(q)}` : `/api/candidates`;
  const data = await fetchJSON(url);
  return data;
}

function renderList(items){
  const el = document.getElementById('list');
  el.innerHTML = '';
  if(!items || items.length===0){ el.innerHTML = '<p>No candidates</p>'; return; }
  items.forEach(c=>{
    const d = document.createElement('div'); d.className='card';
    d.innerHTML = `<strong>${c.name}</strong> <div class="meta">${c.job_title} — ${c.location} — Score: ${c.score} — Exp: ${c.total_experience_count}</div>` +
      `<div style="margin-top:6px">Skills: ${(c.skills||[]).slice(0,6).join(', ')}</div>`;
    el.appendChild(d);
  });
}

async function loadStats(){
  const s = await fetchJSON('/api/statistics');
  const container = document.getElementById('stats');
  container.innerHTML='';
  if(!s.success) return;
  const data = s.data;
  const items = [
    {k:'Total', v:data.totalCandidates},
    {k:'Avg Exp', v:Math.round((data.avgExperience||0)*10)/10},
    {k:'Avg Score', v:Math.round((data.avgScore||0)*10)/10}
  ];
  items.forEach(it=>{
    const n = document.createElement('div'); n.className='stat'; n.innerHTML=`<strong>${it.v}</strong><div class="meta">${it.k}</div>`; container.appendChild(n);
  });
}

async function refresh(q){
  const res = await loadCandidates(q);
  renderList(res.data || []);
  loadStats();
}

document.getElementById('search').addEventListener('click', ()=>{ const q=document.getElementById('q').value.trim(); refresh(q); });
document.getElementById('refresh').addEventListener('click', ()=>{ document.getElementById('q').value=''; refresh(); });

// initial
refresh();

// UI: show admin link if logged in and role=admin
function updateAuthUI(){
  const token = localStorage.getItem('token');
  const adminLink = document.getElementById('adminLink');
  const loginLink = document.getElementById('loginLink');
  if(!token){ adminLink.style.display='none'; loginLink.style.display='inline'; return; }
  try{
    const payload = JSON.parse(atob(token.split('.')[1]));
    if(payload && payload.role==='admin'){ adminLink.style.display='inline'; }
    loginLink.style.display='none';
  }catch(e){ adminLink.style.display='none'; loginLink.style.display='inline'; }
}

updateAuthUI();
