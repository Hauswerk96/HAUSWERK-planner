let state = null;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const statuses = ["К выполнению","В работе","На проверке","Готово"];

async function load(){
  const r = await fetch('/api/state', {cache:'no-store'});
  state = await r.json();
  render();
}
async function save(){
  $("#sync").textContent = "● сохранение…";
  await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
  $("#sync").textContent = "● синхронизировано";
}
const project = id => state.projects.find(x=>x.id===id);
const person = id => state.people.find(x=>x.id===id);
const fmt = d => d ? new Date(d+"T12:00:00").toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}) : "—";
const uid = p => p + Math.random().toString(36).slice(2,9);

function render(){
  $("#today").textContent = new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
  const active = state.tasks.filter(t=>t.status!=="Готово").length;
  const late = state.tasks.filter(t=>t.status!=="Готово" && new Date(t.deadline)<new Date(new Date().toDateString())).length;
  const avg = state.projects.length ? Math.round(state.projects.reduce((a,p)=>a+(+p.progress||0),0)/state.projects.length) : 0;
  $("#stats").innerHTML = [
    ["Активные проекты",state.projects.length],
    ["Задачи в работе",active],
    ["Просрочено",late],
    ["Средняя готовность",avg+"%"]
  ].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join('');

  const soon=[...state.tasks].filter(t=>t.status!=="Готово").sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,5);
  $("#deadlines").innerHTML=soon.map(t=>`<div class="item"><div><b>${t.title}</b><small>${project(t.projectId)?.name||"—"} · ${person(t.assigneeId)?.name||"—"}</small></div><span class="pill ${t.priority==="Высокий"?"high":""}">${fmt(t.deadline)}</span></div>`).join('')||'<p class="muted">Нет активных задач.</p>';

  $("#projectMini").innerHTML=state.projects.slice(0,5).map(p=>`<div class="item"><div><b>${p.name}</b><small>${p.stage} · ${p.progress||0}%</small><div class="bar"><i style="width:${p.progress||0}%"></i></div></div><span>${fmt(p.deadline)}</span></div>`).join('');

  renderTasks(); renderKanban(); renderProjects(); renderWorkload(); refreshSelects();
}
function renderTasks(){
  const f=$("#taskFilter").value;
  $("#taskRows").innerHTML=state.tasks.filter(t=>!f||t.status===f).map(t=>`
    <tr><td><b>${t.title}</b></td><td>${project(t.projectId)?.name||"—"}</td><td>${person(t.assigneeId)?.name||"—"}</td>
    <td><select onchange="quick('${t.id}','status',this.value)">${statuses.map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></td>
    <td><span class="pill ${t.priority==="Высокий"?"high":""}">${t.priority}</span></td><td>${fmt(t.deadline)}</td>
    <td><input style="width:75px" type="number" min="0" max="100" value="${t.progress||0}" onchange="quick('${t.id}','progress',+this.value)"/>%</td>
    <td><button class="danger" onclick="delTask('${t.id}')">×</button></td></tr>`).join('');
}
function renderKanban(){
  $("#kanban").innerHTML=statuses.map(s=>{
    const ts=state.tasks.filter(t=>t.status===s);
    return `<div class="column"><h3>${s} · ${ts.length}</h3>${ts.map(t=>`<div class="taskcard"><b>${t.title}</b><small>${project(t.projectId)?.name||"—"}</small><div class="foot"><span class="pill ${t.priority==="Высокий"?"high":""}">${t.priority}</span><small>${fmt(t.deadline)}</small></div></div>`).join('')}</div>`;
  }).join('');
}
function renderProjects(){
  $("#projectCards").innerHTML=state.projects.map((p,i)=>`<article class="projectcard"><span class="code">PRJ-${String(i+1).padStart(3,'0')} / ${p.stage}</span><h3>${p.name}</h3><p>${p.client||"Без заказчика"}</p><div class="grow"></div><div class="bar"><i style="width:${p.progress||0}%"></i></div><div class="meta"><span>${p.progress||0}%</span><span>${fmt(p.deadline)}</span></div></article>`).join('');
}
function renderWorkload(){
  $("#workRows").innerHTML=state.workload.map(w=>{
    const u=person(w.personId); return `<tr><td><b>${u?.name||"—"}</b><br><small>${u?.role||""}</small></td>${w.weeks.map(h=>`<td class="loadcell"><div class="loadbar"><i style="width:${Math.min(100,h/40*100)}%"></i><b>${h} ч</b></div></td>`).join('')}</tr>`;
  }).join('');
}
function refreshSelects(){
  const pf=$("#taskForm [name=projectId]"), af=$("#taskForm [name=assigneeId]");
  pf.innerHTML=state.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  af.innerHTML=state.people.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}
window.quick=async(id,key,val)=>{const t=state.tasks.find(x=>x.id===id);t[key]=val;render();await save()}
window.delTask=async(id)=>{if(!confirm("Удалить задачу?"))return;state.tasks=state.tasks.filter(x=>x.id!==id);render();await save()}

$$(".tabs button").forEach(b=>b.onclick=()=>{$$(".tabs button").forEach(x=>x.classList.remove("active"));$$(".view").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.view).classList.add("active")});
$("#taskFilter").onchange=renderTasks;
$("#addTask").onclick=()=>$("#taskDialog").showModal();
$("#addProject").onclick=()=>$("#projectDialog").showModal();

$("#taskForm").addEventListener("submit",async e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  state.tasks.unshift({id:uid("t"),title:f.get("title"),projectId:f.get("projectId"),assigneeId:f.get("assigneeId"),status:f.get("status"),priority:f.get("priority"),deadline:f.get("deadline"),progress:+f.get("progress")||0});
  e.currentTarget.reset(); $("#taskDialog").close(); render(); await save();
});
$("#projectForm").addEventListener("submit",async e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const id=uid("p");
  state.projects.unshift({id,name:f.get("name"),client:f.get("client"),stage:f.get("stage"),progress:0,deadline:f.get("deadline"),priority:f.get("priority")});
  e.currentTarget.reset(); $("#projectDialog").close(); render(); await save();
});
load();
